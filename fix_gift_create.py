import sys

with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_logic = '''document.getElementById('giftForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const error = document.getElementById('giftFormError');
    error.textContent = '';
    const senderName = document.getElementById('giftSenderName').value.trim(),
        senderPhone = document.getElementById('giftSenderPhone').value.trim(),
        recipientName = document.getElementById('giftRecipientName').value.trim(),
        recipientPhone = document.getElementById('giftRecipientPhone').value.trim(),
        message = document.getElementById('giftMessage').value.trim(),
        anonymous = document.getElementById('giftAnonymous').checked,
        total = giftValueForSelection();
        
    if (!giftSettings.enabled) return error.textContent = 'نظام الهدايا غير متاح حالياً.';
    if (!senderName || !senderPhone || !recipientName || !recipientPhone || !giftSelection.type || !total) return error.textContent = 'يرجى إكمال بيانات الهدية واختيار قيمتها.';
    if (total < Number(giftSettings.minValue || 1) || total > Number(giftSettings.maxValue || 9999999)) return error.textContent = 'قيمة الهدية خارج الحدود المسموحة.';
    if (anonymous && !giftSettings.allowAnonymous) return error.textContent = 'الهدايا المجهولة غير مفعلة حالياً.';
    if (!db) return error.textContent = 'تعذر الاتصال بقاعدة البيانات، حاول مرة أخرى.';
    
    if (window._lastGiftOrder && window._lastGiftOrder.senderPhone === senderPhone && window._lastGiftOrder.recipientPhone === recipientPhone && window._lastGiftOrder.total === total && (Date.now() - window._lastGiftOrder.time < 60000)) {
       const existingCode = window._lastGiftOrder.orderCode;
       showToast('تم إنشاء طلب الهدية بنجاح 🎁', 'success');
       error.innerHTML = \<span style="color:#27ae60">تم إنشاء الهدية مسبقاً. رقم الطلب: \</span>\;
       return;
    }

    const selected = giftSelection.productIds.map(id => giftEligibleProducts().find(p => String(p.id) === String(id))).filter(Boolean);
    const ref = db.ref('gift_orders').push();
    const giftId = ref.key;
    const orderCode = \GIFT-101-\\;
    const expiresAt = Date.now() + Number(giftSettings.defaultExpiryDays || 30) * 86400000;
    
    const order = {
        giftId, orderCode, senderName, senderPhone, recipientName, recipientPhone, anonymous, message,
        giftType: giftSelection.type,
        productId: selected.length === 1 ? String(selected[0].id) : null,
        productIds: selected.map(p => String(p.id)),
        productName: selected.map(p => p.name).join(' + ') || null,
        giftValue: total,
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        giftStatus: 'awaiting_payment',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        expiresAt, confirmedAt: null, redeemedAt: null, redeemedBy: null
    };
    
    const btn = document.getElementById('giftSubmit');
    btn.disabled = true;
    btn.textContent = 'جارٍ إنشاء طلب الهدية…';
    
    console.log('[GIFT_CREATE_START]', { giftId, orderCode });
    
    try {
        await ref.set(order);
        console.log('[GIFT_FIREBASE_SAVE_SUCCESS]');
        
        window._lastGiftOrder = { time: Date.now(), senderPhone, recipientPhone, total, orderCode };
        showToast('تم إنشاء طلب الهدية بنجاح 🎁', 'success');
        error.innerHTML = \<span style="color:#27ae60">تم إنشاء طلب الهدية بنجاح 🎁<br>رقم طلبك: <strong>\</strong></span>\;
    } catch (e) {
        console.error('[GIFT_FIREBASE_SAVE_FAILED]', { stage: 'Firebase Write', giftId, orderCode, code: e.code, message: e.message });
        error.textContent = 'تعذر إنشاء طلب الهدية، حاول مرة أخرى.';
        btn.disabled = false;
        btn.textContent = '🎁 احجز الهدية وحوّل';
        return;
    }
    
    console.log('[GIFT_POST_SAVE_START]');
    
    try {
        await db.ref('gift_logs').push({
            type: 'gift_created',
            giftId,
            uid: auth?.currentUser?.uid || null,
            role: 'customer',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (e) {
        console.warn('[GIFT_POST_SAVE_FAILED]', { stage: 'Gift Logs Write', code: e.code, message: e.message });
    }
    
    try {
        const wa = (giftSettings.whatsapp || '').replace(/\\D/g, '');
        if (!wa) throw new Error('WhatsApp is not configured');
        console.log('[GIFT_SETTINGS_LOAD_SUCCESS]');
        
        const giftName = order.productName || giftMoney(total);
        const senderVisible = anonymous ? 'هدية مجهولة' : senderName;
        const msg = \\\\n\\n\; 
        const text = (msg + \رقم الطلب: \\\nاسم المُهدي: \\\nنوع الهدية: \\\nالقيمة: \\\nاسم المستلم: \\);
        
        console.log('[GIFT_WHATSAPP_BUILD_SUCCESS]');
        
        const waUrl = \https://wa.me/\?text=\\;
        const popup = window.open(waUrl, '_blank', 'noopener');
        
        if (!popup) {
            throw new Error('Popup blocked');
        }
        console.log('[GIFT_WHATSAPP_OPEN_SUCCESS]');
        error.innerHTML = \<span style="color:#27ae60">تم إنشاء طلب الهدية بنجاح 🎁<br>رقم طلبك: <strong>\</strong><br>أرسل صورة التحويل لتثبيت الهدية.</span>\;
        
    } catch (e) {
        console.error('[GIFT_WHATSAPP_FAILED]', { stage: 'WhatsApp', code: e.code, message: e.message });
        const waLink = giftSettings.whatsapp ? \https://wa.me/\\ : '#';
        error.innerHTML = \<span style="color:#e67e22">تم إنشاء الهدية بنجاح، لكن تعذر فتح WhatsApp تلقائياً. يمكنك متابعة التأكيد من رقم الطلب التالي: <strong>\</strong></span><br><br><a href="\" target="_blank" class="btn btn-primary" style="display:inline-block;margin-top:10px;text-decoration:none;color:white;padding:8px 16px;border-radius:8px;">فتح WhatsApp</a>\;
    }
    
    btn.textContent = '🎁 احجز الهدية وحوّل';
    refreshGiftPayment();
});
'''

for i, line in enumerate(lines):
    if \"document.getElementById('giftForm')?.addEventListener('submit'\" in line:
        lines[i] = new_logic
        break

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)
