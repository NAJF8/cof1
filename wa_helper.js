function buildWhatsAppMessage(type, data) {
    switch (type) {
        case 'order':
            return `مرحباً 101 COFFEE 🤍\nأرغب بتأكيد طلبي.`;
        case 'loyaltyHeart':
            return `مبروك ❤️ حصلت على قلب جديد من 101 COFFEE`;
        case 'giftPayment':
            return `مرحباً 101 COFFEE 🤍\nأرغب بتأكيد طلب الهدية وإرسال إثبات التحويل.`;
        case 'giftRecipient':
            return `🎁 عندك هدية من 101 COFFEE ❤️`;
        case 'giftRedeemSender':
            return `تم استلام هديتك من 101 COFFEE 🤍`;
        case 'booking':
            return `مرحباً 101 COFFEE ❤️\nأرغب بتأكيد الحجز.`;
        default:
            return '';
    }
}
