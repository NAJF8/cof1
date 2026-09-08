const enc=new TextEncoder(),ITERATIONS=310000,MAX_FAILURES=5,WINDOW_MS=900000;
function normalizeMembershipNumber(v){const n=String(v||'').trim().toUpperCase().replace(/\s+/g,'');return /^101-[1-9]\d{0,11}$/.test(n)?n:null;}
function validPin(v){return /^\d{4,6}$/.test(String(v||''));}
function b64(v){let s=String(v||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function out(v){let s='';for(const x of v)s+=String.fromCharCode(x);return btoa(s);}
async function derivePin(pin,salt,pepper){const key=await crypto.subtle.importKey('raw',enc.encode(`${pin}:${pepper}`),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:b64(salt),iterations:ITERATIONS,hash:'SHA-512'},key,512);return out(new Uint8Array(bits));}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
async function timingSafePinMatch(pin,c,pepper){if(!c?.pinHash||!c?.salt||!validPin(pin))return false;return timingSafeEqual(b64(await derivePin(pin,c.salt,pepper)),b64(c.pinHash));}
async function attemptKey(membership,ip,pepper){const k=await crypto.subtle.importKey('raw',enc.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);const d=await crypto.subtle.sign('HMAC',k,enc.encode(`${membership}\n${ip||'unknown'}`));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function createCredential(pin,pepper,now=Date.now()){if(!validPin(pin))throw Error('INVALID_PIN');const salt=out(crypto.getRandomValues(new Uint8Array(32)));return{pinHash:await derivePin(pin,salt,pepper),salt,version:1,failedAttempts:0,lockedUntil:0,updatedAt:now};}
function publicProfile(m,c){return{membershipNumber:m,name:String(c?.name||c?.displayName||'عضو 101').slice(0,120),currentHearts:Number(c?.currentHearts??c?.hearts??0),memberType:String(c?.memberType||c?.membershipStatus||'عضو مميز').slice(0,80),clubNumber:c?.clubNumber?String(c.clubNumber).slice(0,80):null,subscription:c?.activeSubscriptionId?{active:true}:null};}
export{ITERATIONS,MAX_FAILURES,WINDOW_MS,normalizeMembershipNumber,validPin,derivePin,timingSafeEqual,timingSafePinMatch,attemptKey,createCredential,publicProfile};
