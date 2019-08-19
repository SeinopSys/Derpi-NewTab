import Settings from './settings.js';
import { isFirefox } from "./firefox-detector.js";

const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

const LS_KEY = 'cache';

const DEFAULT_DATA = {
	imageData: {},
	interactions: {
		up: false,
		down: false,
		fave: false,
		hide: false,
	},
};

class LocalCache {
	constructor() {
		this.imageDataSource = new BehaviorSubject(DEFAULT_DATA.imageData);
		this.interactionsSource = new BehaviorSubject(DEFAULT_DATA.interactions);
		this.imageData = this.imageDataSource.asObservable().pipe(distinctUntilChanged());
		this.interactions = this.interactionsSource.asObservable().pipe(distinctUntilChanged());
	}

	async init() {
		const cacheLS = localStorage.getItem(LS_KEY);
		if (cacheLS !== null){
			this._cache = $.extend(true, DEFAULT_DATA, JSON.parse(cacheLS));
		}
		else this._cache = DEFAULT_DATA;
	}

	getImageData() {
		return this.imageDataSource.value;
	}

	getInteractions() {
		return this.interactionsSource.value;
	}

	setInteractions(newInteractions = null, save = true) {
		this._cache.interactions = $.extend({}, this.interactionsSource.value, newInteractions);
		this.interactionsSource.next(this._cache.interactions);
		if (save)
			this.save();
	}

	setImageData(newImageData, save = true) {
		this._cache.imageData = $.extend({}, this.imageDataSource.value, newImageData);
		this.imageDataSource.next(this._cache.imageData);
		if (save){
			this.save();
			this.updateInteractions();
		}
	}

	save() {
		localStorage.setItem(LS_KEY, JSON.stringify(this._cache));
	}

	updateInteractions() {
		return new Promise(res => {
			const imageData = this.imageDataSource.value;
			if (!imageData.id){
				res();
				return;
			}

			fetch(`https://${Settings.getDomain()}/${imageData.id}`, { credentials: "include" })
				.then(resp => resp.text())
				.catch(err => {
					console.error('Interaction data could not be updated:', err);
					res(false);
				})
				.then(resp => {
					if (typeof resp !== 'string')
						return;

					const parser = new DOMParser();
					const $el = $(parser.parseFromString(resp, "text/html"));
					const $metabar = $el.find('.image-metabar');
					if (!$metabar.length){
						console.error('Interaction data could not be updated, no metabar found in response:', resp);
						res(false);
						return;
					}
					$.each({
						'.score': 'score',
						'.interaction--upvote .upvotes': 'upvotes',
						'.interaction--downvote .downvotes': 'downvotes',
						'.interaction--fave .favorites': 'faves',
						'.interaction--comments .comments_count': 'comment_count',
					}, (sel, key) => {
						const val = $el.find(sel).text();
						if (typeof val === 'string')
							this.setImageData({ [key]: parseInt(val, 10) }, false);
					});
					this.save();

					const votes = {
						up: false,
						down: false,
						fave: false,
						hide: false,
					};
					if (isFirefox) {
						const interactionData = $el.find('.js-datastore').attr('data-interactions');
						let interactions;
						try {
							interactions = JSON.parse(interactionData);
						}
						catch (e){
							console.error('Interaction data could not be updated, invalid response from server:', interactionData);
							res(false);
							return;
						}
						interactions.forEach(interact => {
							switch (interact.interaction_type){
								case "voted":
									votes[interact.value] = true;
									break;
								case "faved":
									votes.fave = true;
									break;
								case "hidden":
									votes.hide = true;
									break;
							}
						});
					}
					this.setInteractions(votes);
					res(true);
				});
		});
	}

	updateImageData(signal) {
		const credentials = isFirefox ? 'include' : undefined;
		return new Promise((res, rej) => {
			fetch(Settings.getSearchLink(), { credentials, signal }).then(request => {
				request.json().then(data => {
					const { search } = data;

					if (search.length === 0){
						const msgs = ['Search returned no results.'];
						if (Settings.getTags().indexOf('safe') === -1)
							msgs.push('Try enabling the safe system tag or logging in.');
						rej(msgs);
						return;
					}

					let image;
					for (let result of search){
						if (!result.is_rendered)
							continue;

						image = result;
						break;
					}

					if (!image){
						rej(['No rendered image found','Try reloading in a minute or so']);
						return;
					}

					if (/^\/\//.test(image.image))
						image.image = 'https:' + image.image;

					res(image);
				}).catch(rej);
			}).catch(rej);
		});
	}
}

export default (new LocalCache());
