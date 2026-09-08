import { handleLoyaltyRoutes } from './loyalty-routes.js';

const DEFAULT_MODEL = "gemini-3.6-flash";
const MANUAL_ADDRESS = "النجف الأشرف، حي الجامعة مجاور مكتبة الناسخ";
const MANUAL_HOURS = "يومياً من الساعة 7:00 صباحاً حتى الساعة 2:00 ليلاً";
const KIE_ENDPOINT = "https://api.kie.ai/gemini-2.5-flash/v1/chat/completions";
const KIE_MODEL = "gemini-2.5-flash-openai";
const DEFAULT_ORIGINS = ["https://najf8.github.io"];
const DEFAULT_FIREBASE_DATABASE_URL = "https://coffee-30fa7-default-rtdb.firebaseio.com";
const FIREBASE_PROJECT_ID = "coffee-30fa7";
const MANAGED_SECRET_SLOTS = Array.from({length:20},(_,index)=>`GEMINI_API_KEY_${index+1}`);
const LEGACY_SECRET_SLOTS = ["GEMINI_API_KEY","GEMINI_API_KEY_FALLBACK"];
const ADMIN_RATE_LIMIT_WINDOW_MS = 60_000, ADMIN_RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_MESSAGE_LENGTH = 1000, MAX_BODY_BYTES = 32 * 1024, MAX_HISTORY_ITEMS = 12, MAX_HISTORY_TEXT_LENGTH = 600, REQUEST_TIMEOUT_MS = 20_000, RATE_LIMIT_WINDOW_MS = 60_000, RATE_LIMIT_MAX_REQUESTS = 20;
const MODEL_PATTERN = /^[a-z0-9._-]{1,80}$/i, TAG_PATTERN = /^[a-z0-9-]{2,40}$/;
const rateLimitBuckets = new Map(), adminRateLimitBuckets = new Map();
let firebasePublicKeyCache = {expiresAt:0,keys:{}};

function json(body,status=200,headers={}){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});}
function allowedOrigins(env){const values=String(env.ALLOWED_ORIGINS||"").split(",").map(v=>v.trim()).filter(Boolean);return values.length?values:DEFAULT_ORIGINS;}
function corsHeaders(request,env){const origin=request.headers.get("Origin");return origin&&allowedOrigins(env).includes(origin)?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, PATCH, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Max-Age":"86400",Vary:"Origin"}:null;}
function withCors(request,env,body,status=200,headers={}){return json(body,status,{...(corsHeaders(request,env)||{}),...headers});}
function cleanText(value,limit){return typeof value==="string"?value.trim().replace(/\s+/g," ").slice(0,limit):"";}
function clientSafeError(error){return error?.message==="PAYLOAD_TOO_LARGE"?"PAYLOAD_TOO_LARGE":error?.message==="INVALID_REQUEST"?"INVALID_REQUEST":error?.message==="CLOUDFLARE_MANAGEMENT_NOT_CONFIGURED"?"SERVICE_UNAVAILABLE":"ADMIN_KEYS_FAILED";}
function isPlainObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function normalizeTags(value){return [...new Set((Array.isArray(value)?value:[]).map(tag=>cleanText(String(tag||""),40).toLowerCase()).filter(tag=>TAG_PATTERN.test(tag)))].slice(0,20);}
function normalizeList(value,limit=20){return [...new Set((Array.isArray(value)?value:[]).map(item=>cleanText(String(item||""),80).toLowerCase()).filter(Boolean))].slice(0,limit);}
function normalizeHistory(raw){return (Array.isArray(raw)?raw:[]).slice(-MAX_HISTORY_ITEMS).filter(isPlainObject).map(turn=>({role:turn.role==="assistant"||turn.role==="model"?"assistant":turn.role==="user"?"user":"",text:cleanText(turn.text,MAX_HISTORY_TEXT_LENGTH)})).filter(turn=>turn.role&&turn.text);}
function normalizePreferences(raw){const value=isPlainObject(raw)?raw:{};const allowed={temperature:["cold","hot"],type:["coffee","dessert","drink","matcha"],sweetness:["sweet","no_sugar","light"],strength:["strong","light"],milk:["milk","none"],flavor:["chocolate","caramel","fruity"]};return Object.fromEntries(Object.entries(allowed).map(([key,options])=>[key,options.includes(value[key])?value[key]:null]));}
function normalizeCartItems(raw){return (Array.isArray(raw)?raw:[]).filter(isPlainObject).map(item=>({productId:cleanText(String(item.productId??item.id??""),80),name:cleanText(item.name,120),quantity:Math.max(0,Math.min(99,Number(item.quantity??item.qty)||0))})).filter(item=>item.productId&&item.quantity>0).slice(0,50);}
function normalizeProductText(value){return String(value||"").normalize("NFKC").toLowerCase().replace(/[ًٌٍَُِّْـ]/g,"").replace(/[إأآا]/g,"ا").replace(/\s+/g," ").trim();}
function productSearchText(value){let text=normalizeProductText(value).replace(/^(?:ضيف|ضيفيلي|ضيفلي|اضف|أضف|اضيف|أريد|اريد|add|please|to my cart|my cart)\s+/i,"").trim();const aliases=[["latte","لاتيه"],["classic","كلاسيك"],["spanish","سبانيش"],["coconut","جوز الهند"],["vanilla","فانيلا"],["hazelnut","بندق"],["iced","ايس"],["ice","ايس"]];for(const [from,to] of aliases)text=text.replace(new RegExp(`(^| )${from}(?= |$)`,'g'),`$1${to}`);return text.replace(/^(?:one|a|an|the|واحد|واحدة)\s+/i,"").trim();}
function selectionIndex(value){const text=normalizeProductText(value).replace(/\s*\[product_options:[\s\S]+\]$/i,"").trim();const ordinals={"الاول":0,"اول واحد":0,"اول":0,"first":0,"the first one":0,"الثاني":1,"ثاني واحد":1,"ثاني":1,"second":1,"the second one":1,"الثالث":2,"ثالث واحد":2,"ثالث":2,"third":2,"the third one":2};return Object.prototype.hasOwnProperty.call(ordinals,text)?ordinals[text]:-1;}
function resolveProductReference(userText,menu,pending=[]){const selected=Array.isArray(pending)?pending.filter(item=>item&&item.productId&&item.name):[];const index=selectionIndex(userText);if(index>=0&&selected[index])return{status:"EXACT_MATCH",product:menu.find(item=>String(item.productId)===String(selected[index].productId))||null};const query=productSearchText(userText);if(!query)return{status:"NO_MATCH",matches:[]};const exact=menu.filter(item=>[item.name,item.nameAr,item.nameEn].some(name=>normalizeProductText(name)===query));if(exact.length===1)return{status:"EXACT_MATCH",product:exact[0],matches:exact};if(exact.length>1)return{status:"MULTIPLE_MATCHES",matches:exact};const partial=menu.filter(item=>[item.name,item.nameAr,item.nameEn].some(name=>normalizeProductText(name).includes(query)));if(partial.length===1)return{status:"UNIQUE_FUZZY_MATCH",product:partial[0],matches:partial};if(partial.length>1)return{status:"MULTIPLE_MATCHES",matches:partial};return{status:"NO_MATCH",matches:[]};}
function isAddProductRequest(message){return /(?:ضيف|اضف|أضف|اضيف|add|put|cart)/i.test(String(message||""));}
function addQuantity(message){const match=String(message||"").match(/(?:x|×|عدد|quantity)\s*(\d+)/i);return Math.max(1,Math.min(20,Number(match?.[1]||1)));}
function productOptions(matches){return matches.slice(0,8).map(item=>({productId:String(item.productId),name:item.name}));}
function pendingOptionsFromMessage(message){const match=String(message||"").match(/\[PRODUCT_OPTIONS:(\[[\s\S]*\])\]$/);if(!match)return[];try{return productOptions(JSON.parse(match[1]));}catch{return[];}}
function consumeRateLimit(request){const ip=request.headers.get("CF-Connecting-IP")||"unknown",now=Date.now();if(rateLimitBuckets.size>1000)for(const [key,bucket] of rateLimitBuckets)if(now>=bucket.resetAt)rateLimitBuckets.delete(key);const bucket=rateLimitBuckets.get(ip);if(!bucket||now>=bucket.resetAt){rateLimitBuckets.set(ip,{count:1,resetAt:now+RATE_LIMIT_WINDOW_MS});return{allowed:true,retryAfter:0};}bucket.count+=1;return{allowed:bucket.count<=RATE_LIMIT_MAX_REQUESTS,retryAfter:Math.ceil((bucket.resetAt-now)/1000)};}
function consumeAdminRateLimit(request,uid="unknown"){const ip=request.headers.get("CF-Connecting-IP")||"unknown",key=`${uid}:${ip}`,now=Date.now();if(adminRateLimitBuckets.size>1000)for(const [bucketKey,bucket] of adminRateLimitBuckets)if(now>=bucket.resetAt)adminRateLimitBuckets.delete(bucketKey);const bucket=adminRateLimitBuckets.get(key);if(!bucket||now>=bucket.resetAt){adminRateLimitBuckets.set(key,{count:1,resetAt:now+ADMIN_RATE_LIMIT_WINDOW_MS});return{allowed:true,retryAfter:0};}bucket.count+=1;return{allowed:bucket.count<=ADMIN_RATE_LIMIT_MAX_REQUESTS,retryAfter:Math.ceil((bucket.resetAt-now)/1000)};}

async function fetchFirebaseJson(env,path){const base=String(env.FIREBASE_DATABASE_URL||DEFAULT_FIREBASE_DATABASE_URL).replace(/\/$/,"");const response=await fetch(`${base}/${path}.json`,{headers:{Accept:"application/json"},cf:{cacheTtl:0,cacheEverything:false}});if(!response.ok)throw new Error(`FIREBASE_${response.status}`);return response.json();}
async function fetchFirebaseOptional(env,path){try{return await fetchFirebaseJson(env,path);}catch(error){console.warn("[CAFE_CONTEXT_OPTIONAL_PATH_FAILED]",{path,code:error?.message});return null;}}
async function firebaseRequest(env,path,options={}){const base=String(env.FIREBASE_DATABASE_URL||DEFAULT_FIREBASE_DATABASE_URL).replace(/\/$/,""),token=options.authToken?`?auth=${encodeURIComponent(options.authToken)}`:"";const response=await fetch(`${base}/${path}.json${token}`,{method:options.method||"GET",headers:{"Content-Type":"application/json",Accept:"application/json"},body:options.body===undefined?undefined:JSON.stringify(options.body),cf:{cacheTtl:0,cacheEverything:false}});const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}if(!response.ok)throw new Error(`FIREBASE_${response.status}`);return data;}
function base64UrlDecode(value){let input=String(value||"").replace(/-/g,"+").replace(/_/g,"/");while(input.length%4)input+="=";return Uint8Array.from(atob(input),char=>char.charCodeAt(0));}
function pemToArrayBuffer(pem){const b64=String(pem||"").replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g,"");return Uint8Array.from(atob(b64),char=>char.charCodeAt(0)).buffer;}
async function firebasePublicKeys(){const now=Date.now();if(firebasePublicKeyCache.expiresAt>now&&Object.keys(firebasePublicKeyCache.keys).length)return firebasePublicKeyCache.keys;const response=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",{cf:{cacheTtl:300,cacheEverything:true}});if(!response.ok)throw new Error("FIREBASE_CERTS_UNAVAILABLE");const payload=await response.json(),keys={};for(const key of Array.isArray(payload?.keys)?payload.keys:[])if(key?.kid)keys[key.kid]=key;firebasePublicKeyCache={keys,expiresAt:now+300_000};return keys;}
async function verifyFirebaseIdToken(idToken){const parts=String(idToken||"").split(".");if(parts.length!==3)throw new Error("AUTH_TOKEN_INVALID");const header=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));if(header.alg!=="RS256"||!header.kid)throw new Error("AUTH_TOKEN_INVALID");const keys=await firebasePublicKeys(),jwk=keys[header.kid];if(!jwk)throw new Error("AUTH_TOKEN_INVALID");const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);const ok=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,base64UrlDecode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));if(!ok)throw new Error("AUTH_TOKEN_INVALID");const now=Math.floor(Date.now()/1000);if(payload.aud!==FIREBASE_PROJECT_ID||payload.iss!==`https://securetoken.google.com/${FIREBASE_PROJECT_ID}`||Number(payload.exp||0)<=now||Number(payload.iat||0)>now+300||!payload.sub)throw new Error("AUTH_TOKEN_INVALID");return {uid:String(payload.sub),email:cleanText(payload.email,180),claims:payload};}
async function requireSuperAdmin(request,env){const origin=request.headers.get("Origin");if(!origin||!allowedOrigins(env).includes(origin))return {error:withCors(request,env,{ok:false,error:"ORIGIN_NOT_ALLOWED"},403)};const authHeader=request.headers.get("Authorization")||"";const idToken=authHeader.startsWith("Bearer ")?authHeader.slice(7).trim():"";if(!idToken)return {error:withCors(request,env,{ok:false,error:"AUTH_REQUIRED"},401)};let verified;try{verified=await verifyFirebaseIdToken(idToken);}catch{return {error:withCors(request,env,{ok:false,error:"AUTH_INVALID"},401)}}const admin=await firebaseRequest(env,`admins/${verified.uid}`,{authToken:idToken}).catch(()=>null);if(!admin||admin.role!=="super_admin"||admin.active===false||admin.status==="disabled")return {error:withCors(request,env,{ok:false,error:"FORBIDDEN"},403)};return {uid:verified.uid,email:verified.email,idToken,admin};}
function localizedValue(item,field){return cleanText(item?.[field]||item?.[`${field}Ar`]||item?.[`${field}En`]||"",240);}
function normalizeMenu(raw){const entries=Array.isArray(raw)?raw.map((item,index)=>[String(index),item]):Object.entries(isPlainObject(raw)?raw:{});return entries.filter(([,item])=>item&&!item.hidden&&!item.comingSoon&&item.available!==false&&item.active!==false).map(([key,item])=>({productId:cleanText(String(item.id??key),80),name:localizedValue(item,"name"),nameAr:cleanText(item.nameAr,100),nameEn:cleanText(item.nameEn,100),category:cleanText(item.categoryId??item.category,80),description:localizedValue(item,"description"),price:Number.isFinite(Number(item.price))?Number(item.price):0,available:true,aiTags:normalizeTags(item.aiTags)})).filter(item=>item.name).slice(0,160);}
function normalizeCategories(raw){return Object.entries(isPlainObject(raw)?raw:{}).map(([key,item])=>({id:cleanText(String(item?.id??item?.categoryId??key),80),name:localizedValue(item,"name"),nameAr:cleanText(item?.nameAr,100),nameEn:cleanText(item?.nameEn,100),active:item?.active!==false})).filter(item=>item.name&&item.active).slice(0,80);}
function publicText(value,limit=500){return cleanText(typeof value==="string"?value:"",limit);}
function publicRecord(value,limit=600){if(!isPlainObject(value))return{};return Object.fromEntries(Object.entries(value).slice(0,40).map(([key,item])=>[cleanText(key,80),typeof item==='string'?publicText(item,limit):typeof item==='number'||typeof item==='boolean'?item:undefined]).filter(([,item])=>item!==undefined));}
function normalizePublicEvents(raw){const entries=Array.isArray(raw)?raw.map((item,index)=>[String(index),item]):Object.entries(isPlainObject(raw)?raw:{});return entries.map(([id,item])=>({id:cleanText(String(item?.id??id),80),nameAr:publicText(item?.nameAr||item?.name,160),nameEn:publicText(item?.nameEn||item?.name,160),descriptionAr:publicText(item?.descriptionAr||item?.description,400),descriptionEn:publicText(item?.descriptionEn||item?.description,400),date:publicText(item?.date,40),startTime:publicText(item?.startTime,20),endTime:publicText(item?.endTime,20),price:Number(item?.price)||0,isActive:item?.isActive!==false&&item?.status!=='cancelled',isCandleDay:item?.isCandleDay===true||String(id)==='candle_day'})).filter(item=>item.isActive).slice(0,60);}
function normalizePublicPlans(raw){return Object.entries(isPlainObject(raw)?raw:{}).map(([id,item])=>({id:cleanText(String(item?.id??id),80),nameAr:publicText(item?.nameAr||item?.name,160),nameEn:publicText(item?.nameEn||item?.name,160),description:publicText(item?.description,400),price:Number(item?.price)||0,totalUses:Number(item?.totalUses)||0,durationDays:Number(item?.durationDays)||0,enabled:item?.enabled!==false})).filter(item=>item.enabled).slice(0,40);}
function normalizePublicRewards(raw){return Object.entries(isPlainObject(raw)?raw:{}).map(([id,item])=>({id:cleanText(String(item?.id??id),80),name:publicText(item?.name||item?.title,160),description:publicText(item?.description,300),hearts:Number(item?.hearts||item?.heartsRequired)||0,enabled:item?.enabled!==false})).filter(item=>item.enabled&&item.name).slice(0,40);}
function buildCafeKnowledgeContext(settings,categories,menu,aiPublic,events,plans,rewards,giftSettings,roomSettings){
    const s=isPlainObject(settings)?settings:{};
    const ai=isPlainObject(aiPublic)?aiPublic:{};
    const store={name:publicText(s.shopName||s.name||'101 COFFEE',120),description:publicText(s.aboutArDesc||s.aboutEnDesc||s.description||ai.cafeContext,1000),aboutAr:publicText(s.aboutArDesc,1000),aboutEn:publicText(s.aboutEnDesc,1000)};
    const socials={instagram:publicText(s.instagram,120),instagramUrl:publicText(s.instagramUrl,300),whatsapp:publicText(s.whatsapp,40),phone:publicText(s.phone,40),website:publicText(s.websiteUrl||s.website||s.locationUrl,400)};
    const location={address:publicText(s.address,300),addressAr:publicText(s.addressAr,300),addressEn:publicText(s.addressEn,300),mapUrl:publicText(s.mapUrl,400),locationUrl:publicText(s.locationUrl,400)};
    const hours=isPlainObject(s.openingHours)?s.openingHours:(isPlainObject(s.hours)?s.hours:(isPlainObject(s.workingHours)?s.workingHours:{}));
    const hoursText=publicText(s.openingHoursText||s.hoursText||ai.openingHours,240);
    const coffeeBrand={name:publicText(s.coffeeBrand||ai.coffeeBrand||'illy',80),nameAr:publicText(s.coffeeBrandAr||ai.coffeeBrandAr||'قهوة illy الإيطالية',120)};
    const publicAiInfo=publicText(ai.shopInfo,1200);
    const publicEvents=normalizePublicEvents(events);
    const publicSubscription=normalizePublicPlans(plans);
    const loyalty={enabled:s.enableLoyalty!==false,description:publicText(ai.loyaltyInfo||'برنامج الولاء العام متاح للزبائن.',300),rewards:normalizePublicRewards(rewards)};
    const gifts={enabled:giftSettings?.enabled!==false,description:publicText(giftSettings?.paymentMessage,300)};
    const meetingRoom=publicRecord(roomSettings,300);
    return{store,menu,categories,socials,hours,hoursText,location,coffeeBrand,publicAiInfo,events:publicEvents,subscription:publicSubscription,loyalty,gifts,meetingRoom};
}
function normalizeRules(raw){return Object.entries(isPlainObject(raw)?raw:{}).map(([id,rule])=>({id,name:cleanText(rule?.name,100),keywords:normalizeList(rule?.keywords),preferredTags:normalizeTags(rule?.preferredTags),avoidTags:normalizeTags(rule?.avoidTags),preferredProducts:normalizeList(rule?.preferredProducts),priority:Math.max(-100,Math.min(100,Number(rule?.priority)||0)),enabled:rule?.enabled!==false})).filter(rule=>rule.enabled&&rule.name).slice(0,80);}
function normalizeExamples(raw){return Object.entries(isPlainObject(raw)?raw:{}).map(([id,example])=>({id,user:cleanText(example?.user,360),assistant:cleanText(example?.assistant,480),tags:normalizeTags(example?.tags),order:Number(example?.order)||0,enabled:example?.enabled!==false})).filter(example=>example.enabled&&example.user&&example.assistant).sort((a,b)=>a.order-b.order).slice(0,80);}
function contextVersion(value){const source=JSON.stringify(value),hash=[...source].reduce((total,char)=>(Math.imul(total,31)+char.charCodeAt(0))|0,7);return `v${(hash>>>0).toString(16)}`;}
async function loadAuthoritativeContext(env){const [products,categories,settings,aiPublic,rules,examples,events,plans,rewards,giftSettings,roomSettings]=await Promise.all([fetchFirebaseJson(env,"products"),fetchFirebaseJson(env,"categories"),fetchFirebaseJson(env,"settings"),fetchFirebaseOptional(env,"ai_public"),fetchFirebaseOptional(env,"ai_recommendation_rules"),fetchFirebaseOptional(env,"ai_training_examples"),fetchFirebaseOptional(env,"events"),fetchFirebaseOptional(env,"subscription_plans"),fetchFirebaseOptional(env,"rewards"),fetchFirebaseOptional(env,"gift_settings"),fetchFirebaseOptional(env,"roomSettings")]);const menu=normalizeMenu(products),categoryList=normalizeCategories(categories),config=isPlainObject(aiPublic)?aiPublic:{enabled:true,provider:"gemini"},cafeContext=buildCafeKnowledgeContext(settings,categoryList,menu,config,events,plans,rewards,giftSettings,roomSettings),debug={contextVersion:contextVersion({cafeContext,rules,examples}),productCount:menu.length,categoryCount:categoryList.length,ruleCount:normalizeRules(rules).length,exampleCount:normalizeExamples(examples).length};console.info("[CAFE_CONTEXT_UPDATED]",debug);console.info("[MENU_CONTEXT_VERSION]",debug.contextVersion);console.info("[PRODUCT_COUNT]",debug.productCount);console.info("[STORE_SETTINGS_RECEIVED]",Boolean(settings));console.info("[AI_RULES_RECEIVED]",debug.ruleCount);return{cafeContext,menu,config,rules:normalizeRules(rules),examples:normalizeExamples(examples),debug};}

function messageTags(message,preferences){const text=String(message||"").toLowerCase(),tags=[];if(/مر|بدون سكر|مو حلو|ما.*حلو|سادة|bitter|black/.test(text))tags.push("bitter","strong","black");if(/حلو|حالي|sweet|dessert/.test(text))tags.push("sweet");if(/شوكولات|كاكاو|chocolate/.test(text))tags.push("chocolate","dessert");if(/يصحي|قوي|كافيين|strong|energy/.test(text))tags.push("high-caffeine","strong","coffee");if(/بارد|ثلج|ايس|آيس|cold|ice/.test(text))tags.push("cold");if(/حار|ساخن|hot/.test(text))tags.push("hot");if(/قهوة|coffee|espresso|أمريكانو|امريكانو/.test(text))tags.push("coffee");if(/حليب|لاتيه|milk|creamy|كريمي/.test(text))tags.push("milk","creamy");if(/كراميل|caramel/.test(text))tags.push("caramel");if(/فاكه|فراولة|مانجو|fruit/.test(text))tags.push("fruity");if(preferences.temperature)tags.push(preferences.temperature);if(preferences.type)tags.push(preferences.type);if(preferences.strength)tags.push(preferences.strength);if(preferences.milk)tags.push(preferences.milk==="none"?"black":"milk");if(preferences.flavor)tags.push(preferences.flavor);if(preferences.sweetness==="sweet")tags.push("sweet");return[...new Set(tags)];}
function matchingRules(message,rules){const normalized=String(message||"").toLowerCase();return rules.filter(rule=>rule.keywords.some(keyword=>normalized.includes(keyword))).sort((a,b)=>b.priority-a.priority);}
function scoreRecommendations(menu,message,preferences,rules){const detected=messageTags(message,preferences),matched=matchingRules(message,rules),preferred=new Set([...detected,...matched.flatMap(rule=>rule.preferredTags)]),avoid=new Set(matched.flatMap(rule=>rule.avoidTags)),direct=new Set(matched.flatMap(rule=>rule.preferredProducts));return menu.map(product=>{let score=0;for(const tag of product.aiTags){if(preferred.has(tag))score+=10;if(avoid.has(tag))score-=25;}if(direct.has(product.productId))score+=50;score+=matched.reduce((total,rule)=>total+(product.aiTags.some(tag=>rule.preferredTags.includes(tag))?rule.priority:0),0);return{...product,score};}).filter(product=>product.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,"ar")).slice(0,3);}
function relevantExamples(examples,message,tags){const words=String(message||"").toLowerCase();return examples.map(example=>({example,score:(example.tags||[]).filter(tag=>tags.includes(tag)).length*10+example.user.toLowerCase().split(/\s+/).filter(word=>word.length>2&&words.includes(word)).length})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.example.order-b.example.order).slice(0,12).map(item=>item.example);}
const AI_ERROR_REPLY = "المساعد غير متاح حالياً، حاول مرة أخرى.";
function fallbackReply(){return AI_ERROR_REPLY;}
function buildSystemInstruction(context,language,message,preferences,recommendations){const tags=messageTags(message,preferences),rules=matchingRules(message,context.rules),examples=relevantExamples(context.examples,message,tags),languageInstruction=language==="en"?"Reply in concise, friendly English.":"أجب باللهجة العراقية اللطيفة، باختصار وطبيعية.",pref=Object.entries(preferences).filter(([,value])=>value).map(([key,value])=>`${key}: ${value}`).join(", ")||"none",recommendationBlock=recommendations.length?recommendations.map(product=>`- ${product.name} | ${product.price} IQD | tags: ${product.aiTags.join(", ")}`).join("\n"):"No scored product yet; ask exactly one useful preference question.",menu=context.menu.map(product=>`- ${product.name} | ${product.category} | ${product.price} IQD | ${product.description} | tags: ${product.aiTags.join(", ")}`).join("\n"),publicContext=JSON.stringify(context.cafeContext);return `You are the official 101 COFFEE AI barista. ${languageInstruction}\nUse ONLY the current cafeContext and authoritative menu below. Never invent a product, price, availability, opening hour, location, contact account, or policy. If information is missing, say: "حالياً ما عندي هالمعلومة، تگدر تتأكد من فريق 101 COFFEE." Do not claim to update Firebase and do not repeat a known preference or the welcome message. When sufficient, give 1-3 current options with exact prices.\n\nPUBLIC CAFE CONTEXT (read-only):\n${publicContext}\n\nADMIN PERSONALITY:\n${cleanText(context.config.personalityInstructions,1800)||"Friendly professional 101 COFFEE barista."}\n\nRECOMMENDATION STYLE:\n${cleanText(context.config.recommendationStyle,500)||"Offer up to three current menu choices with a short reason."}\n\nKNOWN PREFERENCES: ${pref}\nDETECTED TAGS: ${tags.join(", ")||"none"}\nMATCHED RULES: ${rules.map(rule=>`${rule.name} (${rule.preferredTags.join(",")})`).join("; ")||"none"}\nTOP RECOMMENDATIONS:\n${recommendationBlock}\n\nRELEVANT TRAINING EXAMPLES:\n${examples.map(example=>`Customer: ${example.user}\nBarista: ${example.assistant}`).join("\n")||"none"}\n\nAUTHORITATIVE MENU:\n${menu}`;}
function extractGeminiText(payload){const candidate=Array.isArray(payload?.candidates)?payload.candidates[0]:null;const parts=Array.isArray(candidate?.content?.parts)?candidate.content.parts:[];return parts.filter(part=>part?.thought!==true).map(part=>typeof part?.text==="string"?part.text:"").filter(Boolean).join("\n");}
const CART_ACTION_TYPES=new Set(["cart_add","cart_remove","cart_decrease","cart_increase","cart_clear","cart_get","cart_total"]);
function normalizeActions(raw,menu){const ids=new Set(menu.map(item=>item.productId));return (Array.isArray(raw)?raw:[]).filter(action=>CART_ACTION_TYPES.has(action?.type)).map(action=>({type:action.type,productId:['cart_add','cart_remove','cart_decrease','cart_increase'].includes(action.type)&&ids.has(String(action.productId??""))?String(action.productId):null,quantity:['cart_add','cart_remove','cart_decrease','cart_increase'].includes(action.type)?Math.max(1,Math.min(20,Math.floor(Number(action.quantity)||1))):null})).filter(action=>!['cart_add','cart_remove','cart_decrease','cart_increase'].includes(action.type)||action.productId).slice(0,10);}
function parseGeminiReply(text){const raw=cleanText(text,1800);try{const value=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/gi,""));return{reply:cleanText(value?.reply,1400)||raw,actions:(Array.isArray(value?.actions)?value.actions:[]).filter(action=>CART_ACTION_TYPES.has(action?.type)).slice(0,10)};}catch{return{reply:raw,actions:[]};}}
async function auditGeminiKeyAction(env,auth,action,slot,extra={}){const safeExtra=Object.fromEntries(Object.entries(extra).filter(([key])=>!/(api|secret|token|key)/i.test(key)));return firebaseRequest(env,"ai_gemini_key_audit",{method:"POST",authToken:auth.idToken,body:{action,slot,adminUid:auth.uid,timestamp:Date.now(),...safeExtra}}).catch(()=>console.warn("[GEMINI_KEY_AUDIT_FAILED]",action,slot));}
async function readAdminJson(request){const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error("PAYLOAD_TOO_LARGE");let payload={};try{payload=raw?JSON.parse(raw):{};}catch{throw new Error("INVALID_REQUEST");}if(!isPlainObject(payload))throw new Error("INVALID_REQUEST");return payload;}
async function adminKeyStatusResponse(request,env,auth){const [secretNames,metadata]=await Promise.all([cloudflareSecrets(env),adminGeminiKeyMetadata(env,auth)]);const rows=publicKeyRows(secretNames,metadata),configuredCount=rows.filter(row=>row.configured&&!row.legacy).length;return withCors(request,env,{ok:true,autoFailover:true,configuredCount,keys:rows});}
async function adminAddKey(request,env,auth){const rate=consumeAdminRateLimit(request,auth.uid);if(!rate.allowed)return withCors(request,env,{ok:false,error:"RATE_LIMITED"},429,{"Retry-After":String(rate.retryAfter)});const payload=await readAdminJson(request),apiKey=String(payload.apiKey||"").trim(),label=cleanText(payload.label,80);if(!apiKey||apiKey.length<20)return withCors(request,env,{ok:false,error:"INVALID_API_KEY"},400);const secretNames=await cloudflareSecrets(env),configured=new Set(secretNames),requested=safeSlotName(payload.slot),slot=requested||MANAGED_SECRET_SLOTS.find(name=>!configured.has(name));if(!slot)return withCors(request,env,{ok:false,error:"MAX_KEYS_REACHED",message:"وصلت للحد الأقصى للمفاتيح."},409);if(configured.has(slot))return withCors(request,env,{ok:false,error:"SLOT_ALREADY_CONFIGURED"},409);const record={slot,label:label||`API ${slot.match(/\d+$/)?.[0]}`,enabled:true,priority:Number(payload.priority)||0,lastStatus:"untested",createdAt:Date.now(),createdBy:auth.uid,updatedAt:Date.now()};await putCloudflareSecret(env,slot,apiKey);const metadata=await adminGeminiKeyMetadata(env,auth);metadata[slot]=record;await saveCloudflareGeminiMetadata(env,metadata);await firebaseRequest(env,`ai_gemini_keys/${slot}`,{method:"PATCH",authToken:auth.idToken,body:record});await auditGeminiKeyAction(env,auth,"api_key_added",slot);return withCors(request,env,{ok:true,slot,label:record.label,configured:true});}
async function adminPatchKey(request,env,auth,slot){const safeSlot=safeSlotName(slot);if(!safeSlot)return withCors(request,env,{ok:false,error:"INVALID_SLOT"},400);const rate=consumeAdminRateLimit(request,auth.uid);if(!rate.allowed)return withCors(request,env,{ok:false,error:"RATE_LIMITED"},429,{"Retry-After":String(rate.retryAfter)});const payload=await readAdminJson(request),updates={slot:safeSlot,updatedAt:Date.now()};if(Object.prototype.hasOwnProperty.call(payload,"enabled"))updates.enabled=payload.enabled!==false;if(Object.prototype.hasOwnProperty.call(payload,"priority"))updates.priority=Math.max(-999,Math.min(999,Number(payload.priority)||0));if(Object.prototype.hasOwnProperty.call(payload,"label"))updates.label=cleanText(payload.label,80);const metadata=await adminGeminiKeyMetadata(env,auth);metadata[safeSlot]={...(metadata[safeSlot]||{}),...updates};await saveCloudflareGeminiMetadata(env,metadata);await firebaseRequest(env,`ai_gemini_keys/${safeSlot}`,{method:"PATCH",authToken:auth.idToken,body:updates});if(Object.prototype.hasOwnProperty.call(updates,"enabled"))await auditGeminiKeyAction(env,auth,updates.enabled?"api_key_enabled":"api_key_disabled",safeSlot);return withCors(request,env,{ok:true,slot:safeSlot});}
async function adminDeleteKey(request,env,auth,slot){const safeSlot=safeSlotName(slot);if(!safeSlot)return withCors(request,env,{ok:false,error:"INVALID_SLOT"},400);const rate=consumeAdminRateLimit(request,auth.uid);if(!rate.allowed)return withCors(request,env,{ok:false,error:"RATE_LIMITED"},429,{"Retry-After":String(rate.retryAfter)});await deleteCloudflareSecret(env,safeSlot);const metadata=await adminGeminiKeyMetadata(env,auth);metadata[safeSlot]={...(metadata[safeSlot]||{}),slot:safeSlot,enabled:false,lastStatus:"deleted",deletedAt:Date.now(),deletedBy:auth.uid,updatedAt:Date.now()};await saveCloudflareGeminiMetadata(env,metadata);await firebaseRequest(env,`ai_gemini_keys/${safeSlot}`,{method:"PATCH",authToken:auth.idToken,body:{slot:safeSlot,configured:false,enabled:false,lastStatus:"deleted",deletedAt:Date.now(),deletedBy:auth.uid,updatedAt:Date.now()}});await auditGeminiKeyAction(env,auth,"api_key_deleted",safeSlot);return withCors(request,env,{ok:true,slot:safeSlot,deleted:true});}
async function testGeminiSlot(env,slot){const key=env[slot];if(!key)return {slot,status:0,errorCode:"NOT_CONFIGURED",state:"empty",message:"Empty"};const model=geminiModel(env),body=JSON.stringify({contents:[{role:"user",parts:[{text:"Reply only OK"}]}],generationConfig:{maxOutputTokens:8,temperature:0}}),result=await callGeminiWithKey(key,{model,body},{index:Number(slot.match(/\d+$/)?.[0]||0),source:slot,label:geminiSecretLabel(slot)}),state=secretStatusLabel(result.status,result.code);return {slot,responseSource:geminiSecretLabel(slot),status:result.status,errorCode:result.code,state:state.status,message:state.message,usable:result.status===200};}
async function adminTestKey(request,env,auth,slot){const rate=consumeAdminRateLimit(request,auth.uid);if(!rate.allowed)return withCors(request,env,{ok:false,error:"RATE_LIMITED"},429,{"Retry-After":String(rate.retryAfter)});const safeSlot=slot==="all"?"all":safeSlotName(slot);if(!safeSlot)return withCors(request,env,{ok:false,error:"INVALID_SLOT"},400);const slots=safeSlot==="all"?MANAGED_SECRET_SLOTS.filter(name=>env[name]):[safeSlot],results=[],metadata=await adminGeminiKeyMetadata(env,auth);for(const name of slots){const result=await testGeminiSlot(env,name);results.push(result);const updates={slot:name,lastStatus:result.state,lastHttpStatus:result.status,lastCheckedAt:Date.now(),updatedAt:Date.now()};metadata[name]={...(metadata[name]||{}),...updates};await firebaseRequest(env,`ai_gemini_keys/${name}`,{method:"PATCH",authToken:auth.idToken,body:updates}).catch(error=>console.warn("[GEMINI_KEY_STATUS_SAVE_FAILED]",name,error?.message));await auditGeminiKeyAction(env,auth,"api_key_tested",name,{status:result.status});}await saveCloudflareGeminiMetadata(env,metadata);return withCors(request,env,{ok:true,results});}
async function handleAdminKeys(request,env,url){if(request.method==="OPTIONS"){const cors=corsHeaders(request,env);return cors?new Response(null,{status:204,headers:cors}):json({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);}const auth=await requireSuperAdmin(request,env);if(auth.error)return auth.error;const path=url.pathname.replace(/^\/api\/admin\/keys\/?/,""),parts=path.split("/").filter(Boolean);try{if(request.method==="GET"&&(!parts.length||parts[0]==="status"))return adminKeyStatusResponse(request,env,auth);if(request.method==="POST"&&!parts.length)return adminAddKey(request,env,auth);if(request.method==="PATCH"&&parts.length===1)return adminPatchKey(request,env,auth,parts[0]);if(request.method==="DELETE"&&parts.length===1)return adminDeleteKey(request,env,auth,parts[0]);if(request.method==="POST"&&parts.length===2&&parts[1]==="test")return adminTestKey(request,env,auth,parts[0]);if(request.method==="POST"&&parts.length===1&&parts[0]==="test-all")return adminTestKey(request,env,auth,"all");return withCors(request,env,{ok:false,error:"NOT_FOUND"},404);}catch(error){const safeError=clientSafeError(error);console.error("[GEMINI_ADMIN_KEYS_FAILED]",{error:safeError});const status=safeError==="PAYLOAD_TOO_LARGE"?413:safeError==="INVALID_REQUEST"?400:safeError==="SERVICE_UNAVAILABLE"?503:500;return withCors(request,env,{ok:false,error:safeError},status);}}

function compactProduct(p){return {id:p.productId,name:p.name,category:p.category,price:p.price,available:p.available,description:cleanText(p.description,120),aiTags:p.aiTags};}
function localMenuReply(message,context,preferences){
    const t=String(message||"").toLowerCase(),
        menu=context.menu.filter(p=>p.available!==false),
        money=p=>p.name+" — "+p.price.toLocaleString("en-US")+" د.ع",
        desserts=menu.filter(p=>
            p.category.includes("حلويات")||
            /حلى|كيك|براوني|كوكيز|مافن|موس|تشيز|سان أوريجينال/i.test((p.category||"")+" "+p.name)||
            p.aiTags.includes("dessert")
        );

    if(/سعر|كم|price|بكم/.test(t)){
        const p=menu.find(x=>t.includes(x.name.toLowerCase()));
        if(p)return "سعر "+p.name+": "+money(p)+".";
    }

    if(/وين|موقع|عنوان|مكانكم|وينكم|location|address/.test(t)){
        return "موقعنا: "+MANUAL_ADDRESS+".";
    }

    if(/دوام|ساعات|hours|open|متى تفتح|متى تسد|شوكت تفتح|شوكت تسد/.test(t)){
        return "أوقات دوامنا: "+(context.cafeContext.hoursText||JSON.stringify(context.cafeContext.hours)||MANUAL_HOURS)+".";
    }

    if(/ماركة القهوة|نوع القهوة|بن تستخدمون|coffee brand|what coffee|beans/.test(t)){
        return "نستخدم "+(context.cafeContext.coffeeBrand?.nameAr||'قهوة illy الإيطالية')+".";
    }

    if(desserts.length&&/حلى|حلوى|dessert|كيك/.test(t))
        return "الحلويات المتوفرة: "+desserts.slice(0,8).map(money).join("، ")+".";

    const picks=scoreRecommendations(menu,message,preferences,context.rules).slice(0,3);
    if(picks.length)
        return "أنسب الخيارات من المنيو: "+picks.map(money).join("، ")+".";

    return "حالياً المساعد الذكي مشغول، بس أگدر أساعدك من المنيو مباشرة. تحب قهوة، بارد، لو حلى؟";
}
function localRoute(message,context,preferences){const t=String(message||"").toLowerCase();if(/سعر|كم|price|بكم|وين|موقع|عنوان|location|address|دوام|ساعات|hours|open|متى تفتح|متى تسد|ماركة القهوة|نوع القهوة|بن تستخدمون|coffee brand|what coffee|beans|حلى|حلوى|dessert|كيك/.test(t))return {reply:localMenuReply(message,context,preferences),source:"local-menu-fallback"};return null;}
function relevantMenuForAI(menu,message,preferences){const t=String(message||"").toLowerCase(),dessert=/حلى|حلوى|dessert|cake|كيك/.test(t)||preferences.type==="dessert",coffee=/قهوة|coffee|espresso|لاتيه|americano/.test(t)||preferences.type==="coffee",cold=/بارد|ثلج|ايس|آيس|cold|ice/.test(t)||preferences.temperature==="cold";let list=menu;if(dessert)list=menu.filter(p=>p.category.includes("حلويات")||p.aiTags.includes("dessert"));else if(coffee)list=menu.filter(p=>p.aiTags.includes("coffee")||/قهوة|لاتيه|اسبرسو|أمريكانو|موكا|كابتشينو/i.test(p.name));else if(cold)list=menu.filter(p=>p.aiTags.includes("cold")||p.category.includes("باردة"));return (list.length?list:menu).slice(0,16).map(compactProduct);}
function compactPrompt(context,language,message,preferences,recommendations){
    const assistantName=cleanText(context.config?.assistantName,120)||"زينة";
    const cart=Array.isArray(context.cartItems)?context.cartItems:[];

    return "You are the 101 COFFEE barista. Your current name is "+assistantName+". "
        +(language==="en"?"Reply in concise English.":"أجب باللهجة العراقية باختصار.")
        +" Use only this cafe context and menu. Never invent products or prices. "
        +"Respect history and preferences, do not repeat answered questions. "
        +"The official cafe address and opening hours below are authoritative and override any incomplete location or hours from other context. "
        +"If the user asks where the cafe is, its address, location, opening time or closing time, answer directly from the official information below. "
        +"Do not say you do not know these details. "
        +"Return ONLY valid JSON with keys reply (string) and actions (array). "
        +"Allowed action types are cart_add, cart_remove, cart_decrease, cart_increase, cart_clear, cart_get, cart_total. "
        +"For cart actions use only productId values from the supplied available menu and positive integer quantity <= 20. "
        +"Do not claim an action succeeded; the frontend confirms it. "
        +"If the request is ambiguous, return actions: [] and ask a short question."
        +"\nASSISTANT NAME: "+assistantName
        +"\nOFFICIAL CAFE ADDRESS: "+MANUAL_ADDRESS
        +"\nOFFICIAL OPENING HOURS: "+MANUAL_HOURS
        +"\nCART: "+JSON.stringify(cart)
        +"\nPREFERENCES: "+JSON.stringify(preferences)
        +"\nCAFE: "+JSON.stringify({store:context.cafeContext.store,socials:context.cafeContext.socials,location:context.cafeContext.location,hours:context.cafeContext.hours,hoursText:context.cafeContext.hoursText,coffeeBrand:context.cafeContext.coffeeBrand,events:context.cafeContext.events,subscription:context.cafeContext.subscription,loyalty:context.cafeContext.loyalty,gifts:context.cafeContext.gifts,meetingRoom:context.cafeContext.meetingRoom,publicAiInfo:context.cafeContext.publicAiInfo})
        +"\nMENU: "+JSON.stringify(relevantMenuForAI(context.menu,message,preferences))
        +"\nMATCHES: "+JSON.stringify(recommendations.map(compactProduct));
}
function geminiSecretLabel(source){const name=String(source||"");const match=name.match(/^GEMINI_API_KEY_(\d+)$/);if(match)return `gemini-key-${match[1]}`;if(name==="GEMINI_API_KEY")return "gemini-key";if(name==="GEMINI_API_KEY_FALLBACK")return "gemini-key-fallback";return name.toLowerCase().replace(/_/g,"-");}
function configuredApiKeys(env){const sources=[["GEMINI_API_KEY_1",env.GEMINI_API_KEY_1],["GEMINI_API_KEY_2",env.GEMINI_API_KEY_2],["GEMINI_API_KEY_3",env.GEMINI_API_KEY_3],["GEMINI_API_KEY_4",env.GEMINI_API_KEY_4],["GEMINI_API_KEY_5",env.GEMINI_API_KEY_5],["GEMINI_API_KEY_6",env.GEMINI_API_KEY_6],["GEMINI_API_KEY_7",env.GEMINI_API_KEY_7],["GEMINI_API_KEY_8",env.GEMINI_API_KEY_8],["GEMINI_API_KEY_9",env.GEMINI_API_KEY_9],["GEMINI_API_KEY_10",env.GEMINI_API_KEY_10],["GEMINI_API_KEY_11",env.GEMINI_API_KEY_11],["GEMINI_API_KEY_12",env.GEMINI_API_KEY_12],["GEMINI_API_KEY_13",env.GEMINI_API_KEY_13],["GEMINI_API_KEY_14",env.GEMINI_API_KEY_14],["GEMINI_API_KEY_15",env.GEMINI_API_KEY_15],["GEMINI_API_KEY_16",env.GEMINI_API_KEY_16],["GEMINI_API_KEY_17",env.GEMINI_API_KEY_17],["GEMINI_API_KEY_18",env.GEMINI_API_KEY_18],["GEMINI_API_KEY_19",env.GEMINI_API_KEY_19],["GEMINI_API_KEY_20",env.GEMINI_API_KEY_20],["GEMINI_API_KEY",env.GEMINI_API_KEY],["GEMINI_API_KEY_FALLBACK",env.GEMINI_API_KEY_FALLBACK]],seen=new Set(),keys=[];let rawSecretCount=0;for(const [source,rawValue] of sources){const value=String(rawValue||"").trim();if(!value)continue;rawSecretCount+=1;if(seen.has(value)){console.info("[GEMINI_KEY_DUPLICATE_SKIPPED]",source);continue;}seen.add(value);const index=keys.length+1;keys.push({index,source,label:geminiSecretLabel(source),key:value});}return {rawSecretCount,keys};}
function sanitizeGeminiKeyMetadata(raw){const value=isPlainObject(raw)?raw:{};return Object.fromEntries(Object.entries(value).filter(([slot,item])=>MANAGED_SECRET_SLOTS.includes(slot)||LEGACY_SECRET_SLOTS.includes(slot)).map(([slot,item])=>[slot,{slot,label:cleanText(item?.label,80),enabled:item?.enabled!==false,priority:Math.max(-999,Math.min(999,Number(item?.priority)||0)),lastStatus:cleanText(item?.lastStatus,40),lastCheckedAt:Number(item?.lastCheckedAt)||0,createdAt:Number(item?.createdAt)||0,createdBy:cleanText(item?.createdBy,180),updatedAt:Number(item?.updatedAt)||0,legacy:LEGACY_SECRET_SLOTS.includes(slot)}]));}
function cloudflareGeminiKeyMetadata(env){try{return sanitizeGeminiKeyMetadata(JSON.parse(String(env.GEMINI_KEY_METADATA||"{}")));}catch{return {};}}
async function geminiKeyMetadata(env){return cloudflareGeminiKeyMetadata(env);}
async function adminGeminiKeyMetadata(env,auth){const firebaseMeta=await firebaseRequest(env,"ai_gemini_keys",{authToken:auth.idToken}).catch(()=>({}));return {...cloudflareGeminiKeyMetadata(env),...sanitizeGeminiKeyMetadata(firebaseMeta)};}
async function saveCloudflareGeminiMetadata(env,metadata){await putCloudflareSecret(env,"GEMINI_KEY_METADATA",JSON.stringify(sanitizeGeminiKeyMetadata(metadata)));}
async function configuredApiKeysWithMetadata(env){const pool=configuredApiKeys(env),metadata=await geminiKeyMetadata(env),order=slot=>metadata[slot]?.priority??0;pool.keys=pool.keys.filter(item=>metadata[item.source]?.enabled!==false).sort((a,b)=>order(b.source)-order(a.source)||a.index-b.index);return {...pool,metadata};}
function safeSlotName(slot){const name=String(slot||"").toUpperCase();return MANAGED_SECRET_SLOTS.includes(name)?name:null;}
function cloudflareApiConfig(env){const accountId=cleanText(env.CLOUDFLARE_ACCOUNT_ID,100),workerName=cleanText(env.CLOUDFLARE_WORKER_NAME||"coffee-101-ai-chat",100),token=String(env.CLOUDFLARE_MANAGEMENT_API_TOKEN||"").trim();if(!accountId||!workerName||!token)throw new Error("CLOUDFLARE_MANAGEMENT_NOT_CONFIGURED");return {accountId,workerName,token};}
async function cloudflareSecrets(env){const {accountId,workerName,token}=cloudflareApiConfig(env);const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}});const data=await response.json().catch(()=>({}));if(!response.ok||data?.success===false)throw new Error("CLOUDFLARE_SECRET_LIST_FAILED");return Array.isArray(data.result)?data.result.map(item=>String(item.name||"")).filter(Boolean):[];}
async function putCloudflareSecret(env,slot,value){const {accountId,workerName,token}=cloudflareApiConfig(env);const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({name:slot,text:value,type:"secret_text"})});const data=await response.json().catch(()=>({}));if(!response.ok||data?.success===false)throw new Error("CLOUDFLARE_SECRET_WRITE_FAILED");return true;}
async function deleteCloudflareSecret(env,slot){const {accountId,workerName,token}=cloudflareApiConfig(env);const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets/${encodeURIComponent(slot)}`,{method:"DELETE",headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}});const data=await response.json().catch(()=>({}));if(!response.ok||data?.success===false)throw new Error("CLOUDFLARE_SECRET_DELETE_FAILED");return true;}
function secretStatusLabel(status,code){const http=Number(status)||0;if(http===200)return {status:"active",message:"يعمل"};if(http===429||code==="RESOURCE_EXHAUSTED"||code==="RATE_LIMIT")return {status:"quota_429",message:"Quota Exhausted"};if(http===401||code==="API_KEY_INVALID")return {status:"invalid",message:"غير صالح"};if(http>=500||http===0)return {status:"temporary_error",message:"خطأ مؤقت"};return {status:"untested",message:"غير مختبر"};}
function publicKeyRows(secretNames,metadata){const configured=new Set(secretNames),rows=[];for(const slot of MANAGED_SECRET_SLOTS){const meta=metadata[slot]||{};rows.push({slot,number:Number(slot.match(/\d+$/)?.[0]||0),label:meta.label||`API ${slot.match(/\d+$/)?.[0]}`,configured:configured.has(slot),enabled:meta.enabled!==false,priority:Number(meta.priority)||0,lastStatus:meta.lastStatus||"untested",lastCheckedAt:Number(meta.lastCheckedAt)||0,legacy:false});}for(const slot of LEGACY_SECRET_SLOTS)if(configured.has(slot)){const meta=metadata[slot]||{};rows.push({slot,number:null,label:meta.label||slot,configured:true,enabled:meta.enabled!==false,priority:Number(meta.priority)||-100, lastStatus:meta.lastStatus||"untested",lastCheckedAt:Number(meta.lastCheckedAt)||0,legacy:true});}return rows;}
function normalizeGeminiErrorCode(data,responseStatus){const raw=String(data?.error?.status||data?.error?.code||"").trim(),message=String(data?.error?.message||"");if(raw==="RESOURCE_EXHAUSTED"||/quota|exhausted/i.test(message))return "RESOURCE_EXHAUSTED";if(raw==="RATE_LIMIT"||responseStatus===429||/rate\s*limit/i.test(message))return "RATE_LIMIT";if(raw==="API_KEY_INVALID"||/api key.*invalid|invalid api key/i.test(message))return "API_KEY_INVALID";if(raw)return raw;return responseStatus>=500?"GEMINI_5XX":responseStatus?`HTTP_${responseStatus}`:"NETWORK_ERROR";}
function shouldFailover(result){return result.status===429||result.status>=500||["RESOURCE_EXHAUSTED","RATE_LIMIT","NETWORK_TIMEOUT","NETWORK_ERROR"].includes(result.code)||/quota\s*exceeded|rate\s*limit|timeout/i.test(String(result.code||"")+" "+String(result.detail||""));}
async function callGeminiWithKey(apiKey,payload,keyInfo){
    const index=keyInfo.index,source=keyInfo.source;
    console.info("[GEMINI_KEY_ATTEMPT]",source);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
        const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(payload.model)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:payload.body,signal:controller.signal});
        const data=await response.json().catch(()=>({})),code=normalizeGeminiErrorCode(data,response.status),detail=String(data?.error?.message||"");
        console.info("[GEMINI_KEY_STATUS]",source,response.status);
        if(!response.ok)console.info("[GEMINI_KEY_ERROR_CODE]",source,code);
        if(response.status===401||code==="API_KEY_INVALID")console.warn("[GEMINI_KEY_INVALID]",source);
        if(!response.ok)return {ok:false,status:response.status,code,detail,source,index};
        const reply=cleanText(extractGeminiText(data),1800);
        if(!reply)return {ok:false,status:response.status,code:"AI_EMPTY_REPLY",source,index};
        return {ok:true,status:response.status,code:"OK",source,index,...parseGeminiReply(reply)};
    }catch(error){const code=error?.name==="AbortError"?"NETWORK_TIMEOUT":"NETWORK_ERROR";console.info("[GEMINI_KEY_STATUS]",source,0);console.info("[GEMINI_KEY_ERROR_CODE]",source,code);return {ok:false,status:0,code,source,index};}
    finally{clearTimeout(timeout);}
}
function geminiModel(env){const modelValue=String(env.GEMINI_MODEL||DEFAULT_MODEL).trim();return MODEL_PATTERN.test(modelValue)?modelValue:DEFAULT_MODEL;}
async function keyPoolPayload(env){const pool=await configuredApiKeysWithMetadata(env);console.info("[GEMINI_RAW_SECRET_COUNT]",pool.rawSecretCount);console.info("[GEMINI_KEY_COUNT]",pool.keys.length);return pool;}
async function runGeminiKeyDiagnostics(env){const {rawSecretCount,keys}=await keyPoolPayload(env),model=geminiModel(env),body=JSON.stringify({contents:[{role:"user",parts:[{text:"Reply only OK"}]}],generationConfig:{maxOutputTokens:8,temperature:0}}),payload={model,body},results=[];for(const item of keys){const result=await callGeminiWithKey(item.key,payload,item);const usable=Boolean(result.ok);console.info("[GEMINI_KEY_DIAGNOSTIC]",item.source,result.status,result.code,usable);results.push({index:item.index,source:item.source,responseSource:item.label,status:result.status,errorCode:result.code,usable});}return {rawSecretCount,uniqueKeyCount:keys.length,results};}

async function callKie(message,language,context,history,preferences,recommendations,env){
    const apiKey=String(env.KIE_API_KEY||"").trim();
    if(!apiKey){
        console.info("[KIE_STATUS]","NOT_CONFIGURED");
        return {ok:false,status:0,code:"KIE_NOT_CONFIGURED"};
    }

    const system=compactPrompt(context,language,message,preferences,recommendations);
    const messages=[
        {role:"system",content:system},
        ...history.map(turn=>({role:turn.role==="assistant"?"assistant":"user",content:turn.text})),
        {role:"user",content:message}
    ];

    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
        console.info("[AI_PROVIDER_ATTEMPT]","KIE");

        const response=await fetch(KIE_ENDPOINT,{
            method:"POST",
            headers:{
                Authorization:`Bearer ${apiKey}`,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                model:KIE_MODEL,
                messages,
                temperature:0.35,
                max_tokens:800,
                stream:false
            }),
            signal:controller.signal
        });

        const data=await response.json().catch(()=>({}));
        console.info("[KIE_STATUS]",response.status);

        const inputTokens=Number(data?.usage?.prompt_tokens||0);
        const outputTokens=Number(data?.usage?.completion_tokens||0);
        const totalTokens=Number(data?.usage?.total_tokens||0);

        console.info("[KIE_INPUT_TOKENS]",inputTokens);
        console.info("[KIE_OUTPUT_TOKENS]",outputTokens);
        console.info("[KIE_TOTAL_TOKENS]",totalTokens);

        if(!response.ok){
            const code=String(
                data?.error?.code||
                data?.error?.type||
                data?.error?.message||
                `HTTP_${response.status}`
            ).slice(0,160);
            console.info("[KIE_ERROR]",code);
            return {ok:false,status:response.status,code};
        }

        const content=data?.choices?.[0]?.message?.content;
        let text="";
        if(typeof content==="string"){
            text=content;
        }else if(Array.isArray(content)){
            text=content.map(part=>{
                if(typeof part==="string")return part;
                return typeof part?.text==="string"?part.text:"";
            }).filter(Boolean).join("\n");
        }

        const cleaned=cleanText(text,1800);
        if(!cleaned){
            console.info("[KIE_ERROR]","KIE_EMPTY_REPLY");
            return {ok:false,status:response.status,code:"KIE_EMPTY_REPLY"};
        }

        const parsed=parseGeminiReply(cleaned);
        console.info("[AI_PROVIDER_SELECTED]","KIE");

        return {
            ok:true,
            status:200,
            code:"OK",
            source:"kie-gemini-2.5-flash",
            reply:parsed.reply,
            actions:parsed.actions,
            usage:{inputTokens,outputTokens,totalTokens}
        };
    }catch(error){
        const code=error?.name==="AbortError"?"KIE_TIMEOUT":"KIE_NETWORK_ERROR";
        console.info("[KIE_ERROR]",code);
        return {ok:false,status:0,code};
    }finally{
        clearTimeout(timeout);
    }
}
async function stableAI(message,language,context,history,preferences,recommendations,env){
    // 1) KIE.ai is the primary provider.
    const kieResult=await callKie(message,language,context,history,preferences,recommendations,env);
    if(kieResult.ok){
        console.info("[AI_RESPONSE_SOURCE]",kieResult.source);
        return kieResult;
    }

    console.info("[AI_PROVIDER_FAILOVER]",`KIE -> GOOGLE (${kieResult.code})`);

    // 2) Existing Google Gemini key pool remains the fallback provider.
    const {keys}=await keyPoolPayload(env),strategy=String(env.GEMINI_KEY_STRATEGY||"failover").toLowerCase()==="round-robin"?"round-robin":"failover";
    if(!keys.length)return {ok:false,error:"AI_QUOTA_EXHAUSTED"};
    const model=geminiModel(env);
    const system=compactPrompt(context,language,message,preferences,recommendations),body=JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:history.map(t=>({role:t.role==="assistant"?"model":"user",parts:[{text:t.text}]})).concat([{role:"user",parts:[{text:message}]}]),generationConfig:{maxOutputTokens:800,temperature:.35}}),payload={model,body};
    const start=strategy==="round-robin"?roundRobinCursor++%keys.length:0,available=keys.slice(start).concat(keys.slice(0,start));
    let quotaExhaustedCount=0;
    for(let attempt=0;attempt<available.length;attempt++){
        const item=available[attempt],result=await callGeminiWithKey(item.key,payload,item);
        if(result.status===429||result.code==="RESOURCE_EXHAUSTED"||result.code==="RATE_LIMIT")quotaExhaustedCount+=1;
        if(result.ok){console.info("[GEMINI_KEY_SELECTED]",item.source);console.info("[GEMINI_RESPONSE_SOURCE]",item.label);return {...result,source:item.label};}
        if(result.status===429)keyCooldowns.set(item.index,Date.now()+60_000);
        const canTryNext=shouldFailover(result)||result.status===401||result.code==="API_KEY_INVALID";
        if(attempt<available.length-1&&canTryNext)console.info("[GEMINI_KEY_FAILOVER]",`${item.source}->${available[attempt+1].source}`);
        else if(!canTryNext)break;
    }
    if(quotaExhaustedCount===available.length)console.warn("[GEMINI_ALL_UNIQUE_KEYS_QUOTA_EXHAUSTED]");
    console.warn("[GEMINI_ALL_KEYS_FAILED]");
    return {ok:false,error:"AI_QUOTA_EXHAUSTED"};
}
async function askGeminiWithGuard(message,language,context,history,preferences,recommendations,env,pendingProductSelection=[]){
    pendingProductSelection=pendingProductSelection.length?pendingProductSelection:pendingOptionsFromMessage(message);
    if(isAddProductRequest(message)||(pendingProductSelection.length&&selectionIndex(message)>=0)){
        const resolved=resolveProductReference(message,context.menu,pendingProductSelection);
        if(resolved.status==="MULTIPLE_MATCHES"){
            const options=productOptions(resolved.matches);
            const names=options.map((item,index)=>`${index+1}. ${item.name}`).join("\n");
            return {reply:language==="en"?`Sure 🤎 We have more than one latte option:\n${names}\nWhich one do you mean?`:`أكيد 🤎 عندنا أكثر من خيار:\n${names}\nأي واحد تقصد؟`,actions:[],clarification:{type:"product_selection",options},pendingProductSelection:options};
        }
        if(resolved.status==="NO_MATCH"){
            const query=productSearchText(message)||String(message||"").trim();
            return {reply:language==="en"?`${query} is not currently on the menu.`:`${query} مو موجود حالياً بالمنيو، إذا تحب أگدر أطلعلك أقرب الخيارات الموجودة.`,actions:[],pendingProductSelection:[]};
        }
        if(resolved.product)return {reply:"",actions:[{type:"cart_add",productId:resolved.product.productId,quantity:addQuantity(message)}],pendingProductSelection:[]};
    }
    const local=localRoute(message,context,preferences);
    if(local){console.info("[AI_RESPONSE_SOURCE]",local.source);return {reply:local.reply,actions:[]};}
    const result=await stableAI(message,language,context,history,preferences,recommendations,env);
    if(result.ok){console.info("[AI_RESPONSE_SOURCE]",result.source);return {reply:result.reply,actions:normalizeActions(result.actions,context.menu),pendingProductSelection:[]};}
    console.info("[AI_RESPONSE_SOURCE]","local-menu-fallback");
    return {reply:localMenuReply(message,context,preferences),actions:[]};
}
export default {async fetch(request,env){const url=new URL(request.url),loyaltyResponse=await handleLoyaltyRoutes(request,env,url);if(loyaltyResponse)return loyaltyResponse;const cors=corsHeaders(request,env);if(url.pathname.startsWith("/api/admin/keys"))return handleAdminKeys(request,env,url);if(url.pathname!=="/api/chat")return withCors(request,env,{ok:false,error:"NOT_FOUND"},404);if(request.method==="OPTIONS"){if(!cors)return json({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);return new Response(null,{status:204,headers:cors});}if(request.method!=="POST")return withCors(request,env,{ok:false,error:"METHOD_NOT_ALLOWED"},405,{Allow:"POST, OPTIONS"});if(request.headers.get("Origin")&&!cors)return json({ok:false,error:"ORIGIN_NOT_ALLOWED"},403);if(Number(request.headers.get("Content-Length")||0)>MAX_BODY_BYTES)return withCors(request,env,{ok:false,error:"PAYLOAD_TOO_LARGE"},413);if(!request.headers.get("Content-Type")?.toLowerCase().includes("application/json"))return withCors(request,env,{ok:false,error:"INVALID_REQUEST"},415);const limit=consumeRateLimit(request);if(!limit.allowed)return withCors(request,env,{ok:false,error:"RATE_LIMITED"},429,{"Retry-After":String(limit.retryAfter)});let payload;try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return withCors(request,env,{ok:false,error:"PAYLOAD_TOO_LARGE"},413);payload=JSON.parse(raw);}catch{return withCors(request,env,{ok:false,error:"INVALID_REQUEST"},400);}if(!isPlainObject(payload))return withCors(request,env,{ok:false,error:"INVALID_REQUEST"},400);const message=cleanText(payload?.message,MAX_MESSAGE_LENGTH);if(!message||typeof payload?.message!=="string"||payload.message.trim().length>MAX_MESSAGE_LENGTH)return withCors(request,env,{ok:false,error:"INVALID_MESSAGE"},400);const language=payload?.language==="en"?"en":"ar",history=normalizeHistory(payload?.history),preferences=normalizePreferences(payload?.preferences||payload?.context?.preferences),cartItems=normalizeCartItems(payload?.context?.cartItems);let context;try{context=await loadAuthoritativeContext(env);}catch(error){console.error("AI_FIREBASE_CONTEXT_FAILED",{message:cleanText(error?.message,160)});return withCors(request,env,{ok:true,reply:AI_ERROR_REPLY,fallback:true,debug:{contextVersion:null,productCount:0,contextUnavailable:true}});}if(context.config.enabled===false)return withCors(request,env,{ok:false,error:"AI_DISABLED"},503);context={...context,cartItems};const recommendations=scoreRecommendations(context.menu,message,preferences,context.rules);try{const result=await askGeminiWithGuard(message,language,context,history,preferences,recommendations,env);return withCors(request,env,{ok:true,reply:result.reply,actions:result.actions||[],debug:context.debug});}catch(error){console.error("AI_CHAT_FAILED",{code:error?.message});return withCors(request,env,{ok:true,reply:AI_ERROR_REPLY,actions:[],fallback:true,debug:context.debug});}}};
