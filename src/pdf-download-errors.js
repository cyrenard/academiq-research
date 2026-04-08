function extractHttpStatusCode(input) {
  const text = typeof input === 'string'
    ? input
    : (input && typeof input.error === 'string' ? input.error : '');
  const match = text.match(/\bHTTP\s+(\d{3})\b/i);
  return match ? Number(match[1]) : 0;
}

function classifyPdfDownloadFailure(input) {
  const text = typeof input === 'string'
    ? input
    : (input && typeof input.error === 'string' ? input.error : '');
  const statusCode = extractHttpStatusCode(text);
  const lower = String(text || '').toLowerCase();

  if (statusCode === 401 || statusCode === 403) {
    return {
      type: 'protected_access',
      statusCode,
      isProtectedAccess: true,
      retryable: false,
      userMessage: 'PDF bağlantısı korumalı görünüyor. Referans kaydedildi; PDF için tarayıcıda açıp manuel erişim gerekebilir.'
    };
  }
  if (statusCode === 404) {
    return {
      type: 'not_found',
      statusCode,
      isProtectedAccess: false,
      retryable: false,
      userMessage: 'PDF bağlantısı artık geçerli görünmüyor. Farklı bir PDF/OA kaynağı gerekebilir.'
    };
  }
  if (statusCode === 429) {
    return {
      type: 'rate_limited',
      statusCode,
      isProtectedAccess: false,
      retryable: true,
      userMessage: 'PDF sunucusu istek sınırına takıldı. Biraz sonra yeniden deneyin.'
    };
  }
  if (lower.includes('timeout')) {
    return {
      type: 'timeout',
      statusCode: 0,
      isProtectedAccess: false,
      retryable: true,
      userMessage: 'PDF isteği zaman aşımına uğradı. Bağlantıyı tekrar deneyebilirsiniz.'
    };
  }
  if (
    lower.includes('doi mismatch') ||
    lower.includes('title mismatch') ||
    lower.includes('güven skoru düşük') ||
    lower.includes('guven skoru dusuk') ||
    lower.includes('doi kanıtı yok') ||
    lower.includes('doi kaniti yok')
  ) {
    return {
      type: 'verification_failed',
      statusCode: 0,
      isProtectedAccess: false,
      retryable: false,
      userMessage: 'Bulunan dosya bu makaleyle güvenli biçimde eşleşmedi. Yanlış PDF indirilmedi.'
    };
  }
  return {
    type: 'generic',
    statusCode,
    isProtectedAccess: false,
    retryable: true,
    userMessage: 'PDF indirilemedi. Bağlantı saklandı; isterseniz tarayıcıda açıp manuel yükleyebilirsiniz.'
  };
}

module.exports = {
  extractHttpStatusCode,
  classifyPdfDownloadFailure
};
