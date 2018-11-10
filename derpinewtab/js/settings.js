import setHelper from './set-helper.js';
import { checkDomainPermissions } from './perms.js';

const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

const LS_KEY = 'settings';
export const RATING_TAGS = new Set(['safe', 'suggestive', 'questionable', 'explicit', 'semi-grimdark', 'grimdark', 'grotesque']);
export const DEFAULT_DOMAIN = 'derpibooru.org';
export const DOMAINS = new Set([DEFAULT_DOMAIN, 'www.derpibooru.org', 'trixiebooru.org']);
export const RESOLUTION_CAP = [4096, 4096]; // w, h
export const SEARCH_SETTINGS_KEYS = [
	'tags',
	'andtags',
	'exclude',
	'eqg',
	'hd',
	'rescap',
	'domain',
];
export const METADATA_SETTINGS_KEYS = [
	'showUploader',
	'showScore',
	'showVotes',
	'showVoteCounts',
	'showComments',
	'showFaves',
];
export const DEFAULT_SETTINGS = {
	tags: ['safe'],
	andtags: false,
	exclude: true,
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

class Settings {
	getEQG() {
		return this.searchSources.eqg.value;
	}

	getHD() {
		return this.searchSources.hd.value;
	}

	getResCap() {
		return this.searchSources.rescap.value;
	}

	getDomain() {
		return this.searchSources.domain.value;
	}

	getTags() {
		return this.searchSources.tags.value;
	}

	getSearchLink() {
		return this.searchLinkSource.value;
	}

	getMeta(key) {
		return this.metaSources[key].value;
	}

	constructor() {
		this.searchSources = {};
		SEARCH_SETTINGS_KEYS.forEach(key => {
			this.searchSources[key] = new BehaviorSubject(DEFAULT_SETTINGS[key]);
			this[key] = this.searchSources[key].asObservable().pipe(distinctUntilChanged());
		});

		this.metaSources = {};
		METADATA_SETTINGS_KEYS.forEach(key => {
			this.metaSources[key] = new BehaviorSubject(DEFAULT_SETTINGS[key]);
			this[key] = this.metaSources[key].asObservable().pipe(distinctUntilChanged());
		});

		this.searchLinkSource = new BehaviorSubject(this._generateSearchLink());
		this.searchLink = this.searchLinkSource.asObservable().pipe(distinctUntilChanged());
	}

	/** @private */
	_getTagsQuery() {
		const allowedQuery = new Set(this.searchSources.tags.value);
		const finalQuery = [
			Array.from(allowedQuery).join(this.searchSources.andtags.value !== true ? ' OR ' : ' AND ')
		];
		if (this.searchSources.exclude.value === true){
			const hiddenQuery = [];
			for (let tag of RATING_TAGS)
				if (!allowedQuery.has(tag))
					hiddenQuery.push(`-${tag}`);
			if (hiddenQuery.length > 0)
				finalQuery.push(hiddenQuery.join(' AND '));
			return `(${finalQuery.join(') AND (')})`;
		}
		else return `(${finalQuery[0]})`;
	}

	/** @private */
	_generateSearchLink() {
		let size = (this.searchSources.hd.value ? ['width.gte:1280', 'height.gte:720'] : []);
		if (this.searchSources.rescap.value === true)
			size = size.concat([`width.lte:${RESOLUTION_CAP[0]}`, `height.lte:${RESOLUTION_CAP[1]}`]);
		let query = ['wallpaper', this._getTagsQuery()];
		if (this.searchSources.eqg.value !== true)
			query.push('-equestria girls');
		if (size.length > 0)
			query = query.concat(size);
		return `https://${this.searchSources.domain.value}/search.json?perpage=5&q=${encodeURIComponent(query.join(' AND ')).replace(/%20/g, '+')}`;
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

			SEARCH_SETTINGS_KEYS.forEach(key => {
				this.searchSources[key].next(this._settings[key]);
			});
			this.searchLinkSource.next(this._generateSearchLink());
			METADATA_SETTINGS_KEYS.forEach(key => {
				this.metaSources[key].next(this._settings[key]);
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
				default:
					if (SEARCH_SETTINGS_KEYS.includes(name) || METADATA_SETTINGS_KEYS.includes(name))
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

		for (let key of SEARCH_SETTINGS_KEYS.concat(METADATA_SETTINGS_KEYS))
			await this._setSetting(key, tempSettings, verifiedSettings);

		this.setSettings(verifiedSettings);
	}
}


const instance = new Settings();

export default instance;
