'use strict';
(async()=>{
 try{
  // Discard a prior account's persisted bearer token. The callback issued a new
  // HttpOnly session cookie; do not put tokens in URLs or copy it into JS storage.
  PlatformAPI.clearSession();
  const user=await PlatformAPI.currentUser();
  if(!user)throw Error('Sign-in could not be confirmed. Allow cookies and open Studio in a normal browser tab, then try again.');
  location.replace('dashboard.html');
 }catch(e){document.getElementById('oauthResult').textContent=e.message||'Could not complete sign-in. Please try again.';}
})();
