(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQTipTapWordPaste = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  function cleanPastedHTML(html){
    if(typeof document === 'undefined') return String(html || '');
    var div = document.createElement('div');
    div.innerHTML = html || '';
    div.querySelectorAll('[style]').forEach(function(el){
      var s = el.style;
      s.removeProperty('mso-style-type');
      s.removeProperty('mso-style-name');
      s.removeProperty('mso-style-parent');
      if(s.fontFamily && !s.fontFamily.includes('Times New Roman')) s.removeProperty('font-family');
      if(s.fontSize && s.fontSize !== '12pt') s.removeProperty('font-size');
      if(s.color){
        var c = s.color;
        if(c === 'rgb(0, 0, 0)' || c === '#000000' || c === '#000' || c === 'black') s.removeProperty('color');
      }
      if(s.lineHeight) s.lineHeight = '2';
      if(!el.getAttribute('style') || el.getAttribute('style').trim() === '') el.removeAttribute('style');
    });
    div.querySelectorAll('span').forEach(function(span){
      if(!span.getAttribute('style') && !span.className){
        while(span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.remove();
      }
    });
    div.querySelectorAll('[contenteditable="false"]').forEach(function(el){ el.removeAttribute('contenteditable'); });
    div.querySelectorAll('script,style,link,meta').forEach(function(el){ el.remove(); });
    div.querySelectorAll('*').forEach(function(el){
      Array.from(el.attributes).forEach(function(attr){
        if(attr.name.startsWith('on')) el.removeAttribute(attr.name);
      });
    });
    div.querySelectorAll('p').forEach(function(p){
      p.style.margin = '0';
      // Remove any inline text-indent — indentation is now driven by data-indent-mode + CSS class
      p.style.removeProperty('text-indent');
      var isNoIndent = p.classList.contains('ni') || p.classList.contains('refe') ||
                       p.classList.contains('indent-none') ||
                       p.getAttribute('data-indent-mode') === 'none';
      p.setAttribute('data-indent-mode', isNoIndent ? 'none' : 'first-line');
    });
    return div.innerHTML;
  }

  function escapeHTML(text){
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatPlainTextAPA(text){
    if(!text) return '';
    return String(text)
      .split(/\n\s*\n/)
      .map(function(paragraph){
        var trimmed = paragraph.replace(/\n/g, ' ').trim();
        if(!trimmed) return '';
        return '<p data-indent-mode="first-line">' + escapeHTML(trimmed) + '</p>';
      })
      .filter(Boolean)
      .join('');
  }

  return {
    cleanPastedHTML: cleanPastedHTML,
    formatPlainTextAPA: formatPlainTextAPA
  };
});
