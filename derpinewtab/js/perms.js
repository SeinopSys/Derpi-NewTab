import { isFirefox } from './firefox-detector.js';
import { DEFAULT_DOMAIN } from './settings.js';

function permissionAction(perm, action) {
	if (isFirefox)
		return browser.permissions[action](perm)
			.then(result => new Promise((res, rej) => {
				permissionCallback(result, res, rej);
			}));

	return new Promise((res, rej) => {
		chrome.permissions[action](perm, result => {
			permissionCallback(result, res, rej);
		});
	});
}

function permissionCallback(result, res, rej) {
	if (result)
		res();
	else rej();
}

export function checkPermissions(permissions) {
	return permissionAction({ permissions }, 'contains');
}

export function requestPermissions(permissions) {
	return permissionAction({ permissions }, 'request');
}

function domainPermissionAction(domain, action) {
	const perm = { origins: [`https://${domain}/`] };

	return permissionAction(perm, action);
}

export function checkDomainPermissions(domain) {
	return domainPermissionAction(domain, 'contains');
}

export function requestDomainPermission(domain) {
	if (domain === DEFAULT_DOMAIN)
		return new Promise(res => res());
	return domainPermissionAction(domain, 'request');
}
