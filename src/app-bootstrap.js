window.addEventListener('load', function(){
  try{refreshBusyControls();}catch(_e){}
  if(window.AQStability && typeof window.AQStability.init === 'function'){
    window.AQStability.init();
  }
  if(window.AQTextRepair && typeof window.AQTextRepair.init === 'function'){
    window.AQTextRepair.init();
  }
  if(window.AQAppShell && typeof window.AQAppShell.init === 'function'){
    window.AQAppShell.init();
  }
});

