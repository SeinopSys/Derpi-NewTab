import Settings from './settings.js';
import { isFirefox } from './firefox-detector.js';
import csrfToken from './csrf-token.js';
import Cache from './local-cache.js';
import { requestPermissions } from './perms.js';

const sesCookieName = '_ses';
const cookieUrl = `https://${Settings.getDomain()}/`;
const fallbackSes = 'c1836832948';
const getCookieByName = name => {
  let res;

  const getObject = {
    name,
    url: cookieUrl,
  };
  const handleCookie = existingCookie => {
    res(existingCookie);
  };
  if (isFirefox)
    browser.cookies.get(getObject).then(handleCookie);
  else chrome.cookies.get(getObject, handleCookie);

  return new Promise(resolve => {
    res = resolve;
  });
};
const getSesCookie = () => getCookieByName(sesCookieName);
const clearFallbackSesCookie = () => {
  return new Promise(res => {
    getSesCookie().then(cookie => {
      if (cookie.value === fallbackSes){
        const removeObject = {
          name: sesCookieName,
          url: cookieUrl,
        };
        if (isFirefox)
          browser.cookies.remove(removeObject).then(res);
        else chrome.cookies.remove(removeObject, res);
      }
      else res();
    });
  });
};

function interact(endpoint, active, up) {
  let res, rej;

  const work = () => {
    const type = active ? 'DELETE' : 'POST';
    csrfToken.get(type).then(data => {
      if (!data.signed_in){
        alert('You must be signed in to vote. If you are signed in, try changing your domain in the settings.');
        return;
      }
      $.ajax({
        type,
        url: `https://${Settings.getDomain()}/images/${Cache.getImageData().id}/${endpoint}`,
        beforeSend: request => {
          request.setRequestHeader('x-csrf-token', data.token);
        },
        contentType: 'application/json',
        data: JSON.stringify({
          _method: type,
          up,
        }),
        processData: false,
        success: data => {
          Cache.setImageData({
            faves: data.favourites,
            upvotes: data.upvotes,
            downvotes: data.downvotes,
          });
          clearFallbackSesCookie().then(res);
        },
        error: resp => {
          // Already voted
          if (resp.status === 409){
            vote(true).then(res).catch(rej);
            return;
          }

          alert('Failed to vote');
          console.info(resp);
          clearFallbackSesCookie().then(() => rej(resp));
        },
      });
    }).catch(rej);
  };

  getSesCookie().then(existingCookie => {
    const setObject = {
      domain: `.${Settings.getDomain()}`,
      name: sesCookieName,
      path: '/',
      value: fallbackSes,
      url: cookieUrl,
    };
    if (existingCookie === null){
      if (isFirefox)
        browser.cookies.set(setObject).then(work);
      else chrome.cookies.set(setObject, work);
    }
    else work();
  });

  return new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
}

function requestCookiePermission() {
  return requestPermissions(['cookies']);
}

export function fave(active) {
  return requestCookiePermission().then(() => interact('fave', active));
}

export function vote(active, up) {
  return requestCookiePermission().then(() => interact('vote', active, up));
}

export function hide(active) {
  return requestCookiePermission().then(() => interact('hide', active));
}
