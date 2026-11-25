
function pdlReturnToLibrary(){
  try{window.parent.postMessage({kind:'pdl-return-library'},'*');}
  catch(err){console.warn('Δεν ήταν δυνατή η επιστροφή στη βιβλιοθήκη',err);}
}
