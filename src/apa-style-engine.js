(function(root, factory){
  if(typeof module !== 'undefined' && module.exports){
    module.exports = factory();
    return;
  }
  root.AQApaStyleEngine = factory();
})(typeof window !== 'undefined' ? window : globalThis, function(){
  var LINE_HEIGHT = 'var(--aq-line-spacing,2)';

  var headingStyles = {
    1: {
      id:'heading1',
      tag:'h1',
      textAlign:'center',
      textIndent:'0',
      fontWeight:'bold',
      fontStyle:'normal'
    },
    2: {
      id:'heading2',
      tag:'h2',
      textAlign:'left',
      textIndent:'0',
      fontWeight:'bold',
      fontStyle:'normal'
    },
    3: {
      id:'heading3',
      tag:'h3',
      textAlign:'left',
      textIndent:'0',
      fontWeight:'bold',
      fontStyle:'italic'
    },
    4: {
      id:'heading4',
      tag:'h4',
      textAlign:'left',
      textIndent:'.5in',
      fontWeight:'bold',
      fontStyle:'normal'
    },
    5: {
      id:'heading5',
      tag:'h5',
      textAlign:'left',
      textIndent:'.5in',
      fontWeight:'bold',
      fontStyle:'italic'
    }
  };

  var blockStyles = {
    normal: {
      id:'normal',
      tag:'p',
      textAlign:'left',
      textIndent:'.5in',
      fontWeight:'normal',
      fontStyle:'normal'
    },
    noIndent: {
      id:'noIndent',
      tag:'p',
      textAlign:'left',
      textIndent:'0',
      fontWeight:'normal',
      fontStyle:'normal'
    },
    quote: {
      id:'quote',
      tag:'blockquote',
      textAlign:'left',
      textIndent:'0',
      fontWeight:'normal',
      fontStyle:'normal',
      paddingLeft:'.5in'
    },
    referenceEntry: {
      id:'referenceEntry',
      tag:'p',
      textAlign:'left',
      textIndent:'-.5in',
      paddingLeft:'.5in',
      fontWeight:'normal',
      fontStyle:'normal'
    },
    tableFigureLabel: {
      id:'tableFigureLabel',
      tag:'p',
      textAlign:'center',
      textIndent:'0',
      fontWeight:'bold',
      fontStyle:'normal'
    },
    tableFigureTitle: {
      id:'tableFigureTitle',
      tag:'p',
      textAlign:'center',
      textIndent:'0',
      fontWeight:'normal',
      fontStyle:'italic'
    },
    abstract: {
      id:'abstract',
      tag:'p',
      className:'aq-abstract',
      textAlign:'left',
      textIndent:'0',
      fontWeight:'normal',
      fontStyle:'normal'
    },
    keywords: {
      id:'keywords',
      tag:'p',
      className:'aq-keywords',
      textAlign:'left',
      textIndent:'.5in',
      fontWeight:'normal',
      fontStyle:'italic'
    }
  };

  function getBlockStyle(id){
    var key = String(id || '').trim();
    if(!key || !blockStyles[key]) return null;
    return Object.assign({}, blockStyles[key]);
  }

  function getBlockAttrs(id){
    var style = getBlockStyle(id);
    if(!style) return null;
    var declarations = [];
    if(style.textAlign) declarations.push('text-align:' + style.textAlign + ' !important');
    if(style.textIndent != null) declarations.push('text-indent:' + style.textIndent);
    if(style.paddingLeft) declarations.push('padding-left:' + style.paddingLeft);
    if(style.fontStyle && style.fontStyle !== 'normal') declarations.push('font-style:' + style.fontStyle);
    if(style.fontWeight && style.fontWeight !== 'normal') declarations.push('font-weight:' + style.fontWeight);
    return {
      className: style.className || null,
      textAlign: style.textAlign || null,
      style: declarations.join(';')
    };
  }

  function normalizeLevel(level){
    var parsed = parseInt(level, 10);
    if(parsed >= 1 && parsed <= 5) return parsed;
    return 2;
  }

  function cssDecl(style, options){
    options = options || {};
    var important = options.important ? ' !important' : '';
    var parts = [
      'font-size:12pt' + important,
      'font-weight:' + style.fontWeight + important,
      'font-style:' + style.fontStyle + important,
      'text-align:' + style.textAlign + important,
      'text-indent:' + style.textIndent + important,
      'margin:0' + important,
      'line-height:' + LINE_HEIGHT + important
    ];
    if(style.paddingLeft) parts.push('padding-left:' + style.paddingLeft + important);
    if(options.displayBlock) parts.push('display:block' + important);
    return parts.join(';');
  }

  function getHeadingStyle(level){
    return Object.assign({}, headingStyles[normalizeLevel(level)]);
  }

  function getHeadingAttrs(level){
    var style = getHeadingStyle(level);
    return {
      textAlign:style.textAlign,
      style:'text-align:' + style.textAlign + ' !important;text-indent:' + style.textIndent
    };
  }

  function buildEditorHeadingCSS(rootSelector){
    var root = rootSelector || '#apaed .ProseMirror';
    return [1,2,3,4,5].map(function(level){
      return root + ' h' + level + '{' + cssDecl(headingStyles[level], { important:true, displayBlock:true }) + '}';
    }).join('');
  }

  function buildEditorBlockCSS(rootSelector){
    var root = rootSelector || '#apaed .ProseMirror';
    return ''
      + root + ' p{margin:0!important;padding:0!important;text-indent:.5in!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:break-word!important;}'
      + root + ' p.ni,' + root + ' p[data-indent-mode="none"],' + root + ' p.indent-none{text-indent:0!important;}'
      + root + ' p[data-indent-mode="first-line"],' + root + ' p.indent-first-line{text-indent:.5in!important;}'
      + root + ' blockquote{margin:0!important;padding:0!important;padding-left:.5in!important;text-indent:0!important;line-height:' + LINE_HEIGHT + '!important;}'
      + root + ' blockquote p{text-indent:0!important;}'
      + root + ' .refe,' + root + ' .aq-ref-entry{margin:0!important;padding-left:.5in!important;text-indent:-.5in!important;line-height:' + LINE_HEIGHT + '!important;}'
      + root + ' .aq-table-label,' + root + ' .aq-figure-placeholder{margin:0!important;text-indent:0!important;text-align:center!important;font-weight:700!important;}'
      + root + ' .aq-table-title,' + root + ' .aq-figure-caption{margin:0 0 6pt 0!important;text-indent:0!important;text-align:center!important;font-style:italic!important;}'
      + root + ' p.aq-abstract{margin:0!important;text-indent:0!important;text-align:left!important;line-height:' + LINE_HEIGHT + '!important;}'
      + root + ' p.aq-keywords{margin:0!important;text-indent:.5in!important;text-align:left!important;font-style:italic!important;line-height:' + LINE_HEIGHT + '!important;}';
  }

  function buildExportHeadingCSS(rootSelector){
    var root = rootSelector || '.aq-export-root';
    return [1,2,3,4,5].map(function(level){
      return root + ' h' + level + '{'
        + cssDecl(headingStyles[level], { important:false })
        + ';mso-line-height-rule:exactly;break-after:avoid-page;page-break-after:avoid'
        + '}';
    }).join('');
  }

  function buildExportBlockCSS(rootSelector){
    var root = rootSelector || '.aq-export-root';
    return ''
      + root + ' p{margin:0;line-height:' + LINE_HEIGHT + ';mso-line-height-rule:exactly;text-indent:.5in;orphans:3;widows:3;}'
      + root + ' p[data-indent-mode="first-line"],' + root + ' p.indent-first-line{text-indent:.5in;}'
      + root + ' p[data-indent-mode="none"],' + root + ' p.ni,' + root + ' p.indent-none{text-indent:0;}'
      + root + ' blockquote{margin:0;padding-left:.5in;line-height:' + LINE_HEIGHT + ';text-indent:0;break-inside:avoid;page-break-inside:avoid;}'
      + root + ' blockquote p{text-indent:0;}'
      + root + ' .refe,' + root + ' .aq-ref-entry{margin:0;padding-left:.5in;line-height:' + LINE_HEIGHT + ';text-indent:-.5in;break-inside:avoid;page-break-inside:avoid;}'
      + root + ' .aq-table-label,' + root + ' .aq-figure-placeholder{margin:0;text-indent:0;text-align:center;font-weight:700;}'
      + root + ' .aq-table-title,' + root + ' .aq-figure-caption{margin:0 0 6pt 0;text-indent:0;text-align:center;font-style:italic;}'
      + root + ' p.aq-abstract{margin:0;text-indent:0;text-align:left;line-height:' + LINE_HEIGHT + ';break-inside:avoid;page-break-inside:avoid;}'
      + root + ' p.aq-keywords{margin:0;text-indent:.5in;text-align:left;font-style:italic;line-height:' + LINE_HEIGHT + ';break-after:avoid;page-break-after:avoid;}';
  }

  return {
    LINE_HEIGHT: LINE_HEIGHT,
    headingStyles: headingStyles,
    blockStyles: blockStyles,
    normalizeLevel: normalizeLevel,
    getHeadingStyle: getHeadingStyle,
    getHeadingAttrs: getHeadingAttrs,
    getBlockStyle: getBlockStyle,
    getBlockAttrs: getBlockAttrs,
    buildEditorHeadingCSS: buildEditorHeadingCSS,
    buildEditorBlockCSS: buildEditorBlockCSS,
    buildExportHeadingCSS: buildExportHeadingCSS,
    buildExportBlockCSS: buildExportBlockCSS
  };
});
