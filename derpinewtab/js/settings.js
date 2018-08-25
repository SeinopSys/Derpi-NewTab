import setHelper from './set-helper.js';
import { checkDomainPermissions } from './perms.js';

const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

const LS_KEY = 'settings';
export const RATING_TAGS = new Set(['safe', 'suggestive', 'questionable', 'explicit', 'semi-grimdark', 'grimdark', 'grotesque']);
export const DEFAULT_DOMAIN = 'derpibooru.org';
export const DOMAINS = new Set([DEFAULT_DOMAIN, 'www.derpibooru.org', 'trixiebooru.org']);
export const RESOLUTION_CAP = [4096, 4096]; // w, h
const METADATA_SETTING_KEYS = [
	'showUploader',
	'showScore',
	'showVotes',
	'showVoteCounts',
	'showComments',
	'showFaves',
];
const DEFAULT_SETTINGS = {
	tags: ['safe'],
	eqg: false,
	hd: true,
	rescap: true,
	domain: DEFAULT_DOMAIN,
	showUploader: true,
	showScore: true,
	showVotes: true,
	showVoteCounts: true,
	showComments: true,
	showFaves: true,
};

const eqgSource = new BehaviorSubject(DEFAULT_SETTINGS.eqg);
const hdSource = new BehaviorSubject(DEFAULT_SETTINGS.hd);
const rescapSource = new BehaviorSubject(DEFAULT_SETTINGS.rescap);
const domainSource = new BehaviorSubject(DEFAULT_SETTINGS.domain);
const tagsSource = new BehaviorSubject(DEFAULT_SETTINGS.tags);

const getSearchLink = () => {
	let size = (hdSource.value ? ['width.gte:1280', 'height.gte:720'] : []);
	if (rescapSource.value)
		size = size.concat(['width.lte:' + RESOLUTION_CAP[0], 'height.lte:' + RESOLUTION_CAP[1]]);
	let query = ['wallpaper', `(${tagsSource.value.join(' || ')})`];
	if (eqgSource.value !== true)
		query.push('-equestria girls');
	if (size.length > 0)
		query = query.concat(size);
	return `https://${domainSource.value}/search.json?perpage=5&q=${encodeURIComponent(query.join(' && '))}`;
};
const searchLinkSource = new BehaviorSubject(getSearchLink());
const metaSources = {};

class Settings {
	getEQG() {
		return eqgSource.value;
	}

	getHD() {
		return hdSource.value;
	}

	getResCap() {
		return rescapSource.value;
	}

	getDomain() {
		return domainSource.value;
	}

	getTags() {
		return tagsSource.value;
	}

	getSearchLink() {
		return searchLinkSource.value;
	}

	getMeta(key) {
		return metaSources[key].value;
	}

	constructor() {
		this.eqg = eqgSource.asObservable().pipe(distinctUntilChanged());
		this.hd = hdSource.asObservable().pipe(distinctUntilChanged());
		this.rescap = rescapSource.asObservable().pipe(distinctUntilChanged());
		this.domain = domainSource.asObservable().pipe(distinctUntilChanged());
		this.tags = tagsSource.asObservable().pipe(distinctUntilChanged());
		this.searchLink = searchLinkSource.asObservable().pipe(distinctUntilChanged());

		METADATA_SETTING_KEYS.forEach(key => {
			metaSources[key] = new BehaviorSubject(true);
			this[key] = metaSources[key].asObservable().pipe(distinctUntilChanged());
		});
	}

	async init() {
		const settingsLS = localStorage.getItem(LS_KEY);
		if (settingsLS === null){
			this.migrateSettings();
		}
		await this.verifySettings(settingsLS);
	}

	migrateSettings() {
		const newSettings = {};

		if (localStorage.length > 0){
			localStorage.removeItem('image_hash');
			localStorage.removeItem('image_search');
			localStorage.removeItem('setting_castVotes');

			const oldKeys = {
				'setting_allowed_tags': 'tags',
				'setting_domain': 'domain',
				'setting_metadata': null,
			};

			Object.keys(oldKeys).forEach(oldKey => {
				const item = localStorage.getItem(oldKey);
				if (item === null)
					return;
				localStorage.removeItem(oldKey);

				const newKey = oldKeys[oldKey];
				switch (oldKey){
					case 'setting_allowed_tags':
						newSettings[newKey] = item.split(',');
						break;
					case 'setting_metadata':{
						newSettings.metadata = {};
						const enabled = item.replace(/show/g, '').split(',');
						['uploader', 'score', 'votes', 'comments', 'faves'].forEach(key => {
							if (enabled.indexOf(key) === -1)
								newSettings['show' + (key[0].toUpperCase()) + key.substring(1)] = false;
						});
					}
						break;
					default:
						newSettings[newKey] = item;
				}
			});
		}

		this.setSettings($.extend(true, DEFAULT_SETTINGS, newSettings), false);
	}

	setSettings(obj, save = true) {
		if (save){
			this._settings = $.extend({}, DEFAULT_SETTINGS, this._settings, obj);
			localStorage.setItem(LS_KEY, JSON.stringify(this._settings));

			eqgSource.next(this._settings.eqg);
			hdSource.next(this._settings.hd);
			rescapSource.next(this._settings.rescap);
			domainSource.next(this._settings.domain);
			tagsSource.next(this._settings.tags);
			searchLinkSource.next(getSearchLink());
			METADATA_SETTING_KEYS.forEach(key => {
				metaSources[key].next(this._settings[key]);
			});
		}
		else {
			this._tmpSettings = obj;
		}
	}

	async _setSetting(name, source, target, strict = false) {
		return new Promise((res, rej) => {
			const sourceIsObject = !Array.isArray(source) && source === Object(source);
			const value = sourceIsObject ? source[name] : source;
			if (value === undefined)
				res();

			switch (name){
				case 'tags':
					target.tags = Array.from(setHelper.intersection(RATING_TAGS, new Set(value)));
					if (target.tags.length === 0)
						target.tags = undefined;
					break;
				case 'domain':
					if (DOMAINS.has(value)){
						checkDomainPermissions(value)
							.then(() => {
								target.domain = value;
								res();
							})
							.catch(() => {
								if (strict)
									rej(new Error(`The extension does not have permission to use the ${value} domain.`));
							});
					}
					return;
				case 'eqg':
				case 'hd':
				case 'rescap':
				case 'showUploader':
				case 'showScore':
				case 'showVotes':
				case 'showVoteCounts':
				case 'showComments':
				case 'showFaves':
					target[name] = Boolean(value);
					break;
			}

			res();
		});
	}

	async setSetting(key, value) {
		const verifiedSettings = {};
		await this._setSetting(key, value, verifiedSettings, true);

		this.setSettings(verifiedSettings);
	}

	/* Toggle a boolean setting's value */
	async toggleSetting(key) {
		const verifiedSettings = {};
		await this._setSetting(key, !this._settings[key], verifiedSettings, true);

		this.setSettings(verifiedSettings);
	}

	async verifySettings(lsContents = null) {
		if (lsContents !== null){
			this.setSettings(JSON.parse(lsContents), false);
		}

		const tempSettings = this._tmpSettings;
		const verifiedSettings = {};

		await this._setSetting('eqg', tempSettings, verifiedSettings);
		await this._setSetting('hd', tempSettings, verifiedSettings);
		await this._setSetting('tags', tempSettings, verifiedSettings);
		await this._setSetting('domain', tempSettings, verifiedSettings);
		METADATA_SETTING_KEYS.forEach(async key => {
			await this._setSetting(key, tempSettings, verifiedSettings);
		});

		this.setSettings(verifiedSettings);
	}
}


const instance = new Settings();

export default instance;
