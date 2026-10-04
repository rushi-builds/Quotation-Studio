'use strict';
(function(){
 const api=window.PlatformAPI;if(!api)return;
 const labels={google:'Google',microsoft:'Microsoft',apple:'Apple'};
 const errors={ACCOUNT_EXISTS:'An account already uses this email. Sign in with your existing method, then connect this provider in Settings → Profile. Accounts are never merged automatically.',IDENTITY_IN_USE:'This provider account is already connected, or a different account from this provider is connected. Sign in with your existing method.',EMAIL_UNAVAILABLE:'The provider did not supply a usable email. Sign in to your existing Studio account and connect the provider in Settings → Profile.',SIGNIN_EXPIRED:'Sign-in expired or browser cookies were blocked. Open Studio in a normal browser tab and try again.',LINK_SESSION_EXPIRED:'Your Studio session expired. Sign in again before connecting an account.',SIGNIN_CANCELLED:'Provider sign-in was cancelled. Your account is unchanged.',SIGNIN_FAILED:'Provider sign-in could not be completed. Try again or use your existing sign-in method.'};
 let providers=[],loaded=false,pending=false,lastUser='';
 function message(text){if(typeof window.toast==='function')window.toast(text,true);const el=document.getElementById('socialMessage');if(el){el.textContent=text;el.hidden=false;}}
 async function refresh(){
  if(pending)return;pending=true;
  try{const result=await api.socialProviders();providers=result.providers||[];loaded=true;
   document.querySelectorAll('[data-p]').forEach(b=>{const p=providers.find(p=>p.id===b.dataset.p);b.title=p?.configured?'Continue with '+p.name:p?.name+' sign-in requires administrator setup';b.setAttribute('aria-label',b.title);});
   if(result.passwordLogin===false){const help=document.getElementById('socialPasswordHelp');if(help)help.hidden=false;['currPassword','newPassword','newPassword2','btnChangePassword'].forEach(id=>{const e=document.getElementById(id);if(e)e.disabled=true;});}
  }catch{message('Unable to check social sign-in. Email/password sign-in is unchanged.');}finally{pending=false;}
 }
 async function start(provider,link=false,button){
  if(!labels[provider])return;
  try{
   if(!loaded)await refresh();
   if(!providers.find(p=>p.id===provider)?.configured){message(labels[provider]+' sign-in needs provider registration and secure administrator configuration. It is not live yet.');return;}
   if(button)button.disabled=true;
   const password=document.getElementById('socialCurrentPassword');const currentPassword=link&&password?password.value:'';if(password)password.value='';
   const result=await api.startSocial(provider,link,currentPassword);
   const u=new URL(result.url);const allowed=['accounts.google.com','login.microsoftonline.com','appleid.apple.com'];
   if(u.protocol!=='https:'||!allowed.includes(u.hostname))throw Error('Invalid sign-in destination.');
   location.assign(u.href);
  }catch(e){message(e.message||'Could not start provider sign-in.');if(button)button.disabled=false;}
 }
 window.StudioSocial={start};
 const error=new URLSearchParams(location.search).get('oauth_error');
 if(error){message(errors[error]||errors.SIGNIN_FAILED);history.replaceState(null,'',location.pathname+location.hash);}
 document.addEventListener('qs:workspace-updated',()=>{const uid=window.QSDash?.user()?.id||'';if(uid!==lastUser){lastUser=uid;refresh();}});
 refresh();
})();
