import Settings from './settings.js';
import { isFirefox } from './firefox-detector.js';
import csrfToken from './csrf-token.js';
import Cache from './local-cache.js';
import { requestPermissions } from './perms.js';

const sesCookieName = '_ses';
const cookieUrl = `https://${Settings.getDomain()}/`;
const fallbackSes = 'bburu8b1123';
const getSesCookie = () => {
	let res;

	const getObject = {
		name: sesCookieName,
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

function interact(endpoint, value) {
	let res, rej;

	const work = () => {
		const type = 'PUT';
		csrfToken.get(type).then(data => {
			if (!data.signed_in){
				alert('You must be signed in to vote. If you are signed in, try changing your domain in the settings.');
				return;
			}

			$.ajax({
				type,
				url: `https://${Settings.getDomain()}/api/v2/interactions/${endpoint}`,
				beforeSend: request => {
					request.setRequestHeader('x-csrf-token', data.token);
				},
				contentType: 'application/json',
				data: JSON.stringify({
					"class": "Image",
					"id": Cache.getImageData().id,
					"value": value,
					"_method": type,
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
						vote('false').then(res).catch(rej);
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
			domain: Settings.getDomain(),
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

export function fave(way) {
	return requestCookiePermission().then(() => interact('fave', way));
}

export function vote(way) {
	return requestCookiePermission().then(() => interact('vote', way));
}

export function hide(way) {
	return requestCookiePermission().then(() => interact('hide', way));
}
