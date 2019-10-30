import Settings from './settings.js';

const isSignedIn = html => /<\/head><body data-signed-in="true"/.test(html);

let tokenCache = {};

const useCacheForMethods = {
	PUT: true,
	GET: false,
};

export default {
	get(requestMethod) {
		if (tokenCache.token && useCacheForMethods[requestMethod] === true)
			return new Promise(res => {
				res(tokenCache)
			});
		return new Promise((res, rej) => {
			fetch(`https://${Settings.getDomain()}/pages/about`, { credentials: 'include' })
				.then(resp => resp.text())
				.catch(rej)
				.then(resp => {
					let token = resp.match(/<meta name="csrf-token" content="([^"]+)" \/>/);
					if (token[1]){
						tokenCache = { token: token[1], signed_in: isSignedIn(resp) };
						res(tokenCache);
					}
					rej(resp);
				})
				.catch(rej);
		});
	},
	clear() {
		tokenCache = {};
	}
};
