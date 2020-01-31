import Settings from './settings.js';

let tokenCache = {};

const useCacheForMethods = {
  POST: true,
  DELETE: true,
  GET: false,
};

export default {
  get(requestMethod) {
    if (tokenCache.token && useCacheForMethods[requestMethod] === true)
      return Promise.resolve(tokenCache);
    return new Promise((res, rej) => {
      fetch(`https://${Settings.getDomain()}/pages/about`, { credentials: 'include' })
        .then(resp => resp.text())
        .catch(rej)
        .then(resp => {
          const parser = new DOMParser();
          const $page = $(parser.parseFromString(resp, 'text/html'));
          let token = $page.find('meta[name="csrf-token"]').attr('content');
          if (token){
            tokenCache = { token, signed_in: $page.find('.header__link-user').length > 0 };
            res(tokenCache);
            return;
          }
          rej(resp);
        })
        .catch(rej);
    });
  },
  clear() {
    tokenCache = {};
  },
};
