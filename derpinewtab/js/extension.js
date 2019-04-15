import Settings, {
	DOMAINS,
	RATING_TAGS,
	RESOLUTION_CAP,
	SEARCH_SETTINGS_KEYS,
	METADATA_SETTINGS_KEYS
} from './settings.js';
import csrfToken from './csrf-token.js';
import Cache from './local-cache.js';
import { isFirefox } from './firefox-detector.js';
import { requestDomainPermission } from './perms.js';
import fa from './fa.js';
import { vote, fave, hide } from './interactions.js';
import Connectivity from './connectivity.js';
import setHelper from './set-helper.js';

const SEARCH_SETTINGS_CHECKBOX_KEYS = (() => {
	const SEARCH_SETTINGS_NON_CHECKBOX_KEYS = new Set(['tags','domain']);

	return Array.from(
		setHelper.difference(new Set(SEARCH_SETTINGS_KEYS), SEARCH_SETTINGS_NON_CHECKBOX_KEYS)
	);
})();

export const METADATA_SETTING_NAMES = {
	showId: 'Show image ID',
	showUploader: 'Show uploader',
	showScore: 'Show aggregate score',
	showVotes: 'Show votes',
	showVoteCounts: 'Show individual vote counts',
	showComments: 'Show comment count',
	showFaves: 'Show favorite count',
	showHide: 'Show hide button',
};

class Extension {
	constructor() {
		this.$settings = $('#settings');
		this.$version = $('#version');
		this.$searchSettings = $('#search-settings');
		this.$body = $('body');
		this.$metaSettings = $('#metadata-settings');
		this.$domainSettings = $('#domain-settings');
		this.$ffDomainApply = $('#firefox-domain-apply');
		this.$image = $('#image');
		this.$imageGhost = $('#image-ghost');
		this.$data = $('#data');
		this.$style = $('#style');
		this.$viewport = $('#viewport');
		this.$clearSettings = $('#clear-settings');
		this.$searchLink = $('#search-link');
		this.$showSettingsButton = $('#show-settings-button');
		this.$rescapWidth = $('#rescap-width');
		this.$rescapHeight = $('#rescap-height');
		this.$noRatingTags = $('#no-rating-tags');

		this.$ratingTags = this.$settings.find('.rating-tags');
		this.$domainSelect = this.$domainSettings.find('select');
		this.searchSettingsInputs = {};
		SEARCH_SETTINGS_CHECKBOX_KEYS.forEach(key => {
			this.searchSettingsInputs[key] = this.$searchSettings.find(`input[name="${key}"]`);
		});

		this.updatingImage = false;
		this.fetchController = null;

		this.searchSettingsRefreshCountdownInterval = undefined;

		this.handleDomainChange = this.handleDomainChange.bind(this);
		this.resetDomainSelect = this.resetDomainSelect.bind(this);
		this.updateImage = this.updateImage.bind(this);
	}

	async init() {
		this.$version.text(' v' + chrome.runtime.getManifest().version);
		this.$rescapWidth.text(RESOLUTION_CAP[0]);
		this.$rescapHeight.text(RESOLUTION_CAP[1]);

		await Settings.init();
		await Cache.init();

		this.createElements();
		this.createSubscriptions();
		this.attachEventHandlers();
		this.handleFirstRun();
	}

	createElements() {
		// Click-able rating tags
		const currentTagsSet = new Set(Settings.getTags());
		RATING_TAGS.forEach(el => {
			this.$ratingTags.append(
				$(document.createElement('label')).append(
					$(document.createElement('input')).attr({
						type: 'checkbox',
						name: el,
					}).prop('checked', currentTagsSet.has(el)),
					`<span class="tag" data-tag-category="rating">${el}</span>`
				)
			);
		});

		// Domain select
		const currentDomain = Settings.getDomain();
		DOMAINS.forEach(domain => {
			this.$domainSelect.append(`<option ${domain === currentDomain ? 'selected' : ''}>${domain}</option>`);
		});

		// Metadata settings
		METADATA_SETTINGS_KEYS.forEach(key => {
			const settingValue = Settings.getMetaByKey(key);
			this.$metaSettings.append(
				$(document.createElement('label')).attr('class','switch').append(
					$(document.createElement('input')).attr({
						type: 'checkbox',
						name: key,
					}).prop('checked', settingValue),
					`<span class="lever"></span>`,
					$(document.createElement('span')).text(METADATA_SETTING_NAMES[key])
				)
			)
		});
		this.$metaToggles = this.$metaSettings.find('.switch input');
	}

	createSubscriptions() {
		Cache.interactions.subscribe(() => this.displayImageData());
		Cache.imageData.subscribe(imageData => this.displayImageData(imageData));

		Settings.searchLink.subscribe(link => {
			this.$searchLink.attr('href', link.replace('.json?perpage=5&', '?'));
			this.updateImage();
		});
		Settings.domain.subscribe(domain => {
			if (isFirefox)
				this.$domainSelect.triggerHandler('change');
			csrfToken.clear();
			this.updateDomainsOnPage(domain);
		});
		SEARCH_SETTINGS_CHECKBOX_KEYS.forEach(key => {
			Settings[key].subscribe(checked => this.searchSettingsInputs[key].prop('checked', checked));
		});
		this.$metaToggles.each((_, el) => {
			const { name } = el;
			Settings[name].subscribe(value => {
				setTimeout(() => {
					el.checked = value;
					this.$data.find('.' + name.replace(/^show/, '').toLowerCase()).classIf(!value, 'hidden');
					const showingMetaCount = this.$metaToggles.filter(':checked').length;
					$('#artist-list').classIf(showingMetaCount === 0, 'expand');
					$('#metadata-list').toggle(showingMetaCount !== 0);
				});
			});
		});

		Connectivity.online.subscribe(online => {
			this.$body.classIf(!online, 'offline');
			if (!Cache.getImageData().id)
				this.updateImage();
		});
	}

	attachEventHandlers() {
		this.$showSettingsButton.removeClass('disabled').on('click', () => {
			this.$body.toggleClass('sidebar-open');
		});
		if (isFirefox){
			this.$ffDomainApply.on('click', this.handleDomainChange);
			this.$domainSelect.on('change', function() {
				this.$ffDomainApply.prop('disabled', this.$domainSelect.val() === Settings.getDomain());
			});
		}
		else {
			this.$ffDomainApply.remove();
			this.$domainSelect.on('change', this.handleDomainChange);
		}
		this.$searchSettings.find('input').on('click', () => {
			if (typeof this.searchSettingsRefreshCountdownInterval === "number"){
				clearInterval(this.searchSettingsRefreshCountdownInterval);
				this.searchSettingsRefreshCountdownInterval = undefined;
			}

			let i = 1,
				refreshCountdown = () => {
					if (i-- <= 0){
						this.updateSearchSettings();
						clearInterval(this.searchSettingsRefreshCountdownInterval);
					}
				};

			this.searchSettingsRefreshCountdownInterval = setInterval(refreshCountdown, 1000);
			refreshCountdown();
		});
		this.$metaSettings.find('.switch input').on('click', e => {
			e.preventDefault();

			const { name } = e.target;

			Settings.toggleSetting(name);
		});
		this.$clearSettings.on('click', e => {
			e.preventDefault();

			if (!confirm("This will clear all data from the extension's local storage. Any cached image data will be removed along with your settings.\n\nReady to start fresh?"))
				return;

			localStorage.clear();
			location.reload();
		});

		this.$data.on('click', '.upvotes', function() {
			const $this = $(this);
			const active = $this.hasClass('active');
			vote(active ? 'false' : 'up').then(() => {
				$this.classIf(!active, 'active');
				const down = active ? undefined : false;
				Cache.setInteractions({ up: !active, down });
			});
		});
		this.$data.on('click', '.downvotes', function() {
			const $this = $(this);
			const active = $this.hasClass('active');
			vote(active ? 'false' : 'down').then(() => {
				$this.classIf(!active, 'active');
				const up = active ? void 0 : false;
				Cache.setInteractions({ down: !active, up });
			});
		});
		this.$data.on('click', '.faves', function() {
			const $this = $(this);
			const active = $this.hasClass('active');
			fave(active ? 'false' : 'true').then(() => {
				$this.classIf(!active, 'active');
				const up = !active ? true : undefined;
				const down = !active ? false : undefined;
				Cache.setInteractions({ fave: !active, up, down });
			});
		});
		this.$data.on('click', '.hide', function() {
			const $this = $(this);
			const active = $this.hasClass('active');
			hide(active ? 'false' : 'true').then(() => {
				$this.classIf(!active, 'active');
				Cache.setInteractions({ hide: !active });
			});
		});
	}

	handleFirstRun() {
		if (localStorage.getItem('firstrun'))
			return;

		$(document.createElement('div'))
			.attr('id', 'dialog')
			.html('<div id="dialog-inner"><h1>Welcome to Derpi-New Tab</h1><p>To access the settings click the menu icon in the bottom left.<br><span class="faded">(this message is only displayed once)</span></p></div>')
			.children()
			.append($(document.createElement('button')).text('Got it').on('click', function(e) {
				e.preventDefault();

				localStorage.setItem('firstrun', '1');
				let $dialog = $('#dialog').addClass('gtfo');
				setTimeout(function() {
					$dialog.remove();
				}, 550);
			}))
			.end()
			.prependTo(this.$body);
	}

	handleDomainChange() {
		const newDomain = this.$domainSelect.val();

		if (!DOMAINS.has(newDomain)){
			this.resetDomainSelect();
			return;
		}

		requestDomainPermission(newDomain)
			.then(() => {
				Settings.setSetting('domain', newDomain);
			})
			.catch(this.resetDomainSelect);
	}

	resetDomainSelect() {
		this.$domainSelect.val(Settings.getDomain()).triggerHandler('change');
	}

	hideImages() {
		this.$viewport.removeClass('show-images');
	}

	showImages() {
		this.$viewport.addClass('show-images');
	}

	updateImage() {
		if (this.updatingImage){
			this.fetchController.abort();
		}

		this.updatingImage = true;
		this.fetchController = new AbortController();
		const isOffline = !Connectivity.isOnline();
		const cachedImageData = Cache.getImageData();
		const done = () => {
			this.updatingImage = false;
			this.$body.removeClass('loading');
		};
		const err = () => {
			if (!cachedImageData.id)
				this.$data.html('<h1>There was an error while fetching the image data</h1><p>' + (isOffline ? 'You are not connected to the Internet.' : 'Derpibooru may be down for maintenance, try again later.') + '</p>');
			else console.error('There was an error while searching for new images, keeping last cached state silently');
			done();
		};

		this.$searchSettings.find('.re-request:visible').slideUp();

		if (isOffline){
			err();
			return;
		}

		if (this.$data.is(':empty'))
			this.$data.html('<h1>Requesting metadata&hellip;</h1>');
		this.$body.addClass('loading');

		Cache.updateImageData(this.fetchController.signal).then(image => {
			const cachedImageData = Cache.getImageData();
			if (cachedImageData.sha512_hash === image.sha512_hash){
				Cache.setImageData(image);
				this.showImages();
				done();
				return;
			}

			$(new Image()).attr('src', image.image).on('load', () => {
				this.updatingImage = false;
				this.$body.removeClass('loading');
				Cache.setImageData(image);
			}).on('error', () => {
				if (!image.is_rendered)
					this.$data.html('<h1>Image has not been rendered yet</h1><p>Try reloading in a minute or so</p>');
				else this.$data.html('<h1>Image failed to load</h1><p>Either the image is no longer available or the extension is broken</p>');
				this.showImages();
				done();
			});
		}).catch(msgs => {
			if (!Array.isArray(msgs)){
				if (String(msgs).indexOf('abort') !== -1){
					done();
					return;
				}
				err();
			}
			this.showImages();
			this.$body.removeClass('loading');
			this.$data.html(`<h1>${msgs[0]}</h1>`);
			if (msgs.length > 1)
				this.$data.append(`<p>${msgs[1]}</p>`);
			done();
		});
	}

	async updateSearchSettings() {
		const tagArray = [];
		this.$ratingTags.find('input').each(function(_, el) {
			const { name, checked } = el;
			if (checked)
				tagArray.push(name);
		});
		if (!tagArray.length){
			this.$noRatingTags.stop().slideDown();
			return;
		}
		this.$noRatingTags.stop().slideUp();

		await Settings.setSetting('tags', tagArray);
		for (let key of SEARCH_SETTINGS_CHECKBOX_KEYS)
			await Settings.setSetting(key, this.searchSettingsInputs[key].prop('checked'));

		this.hideImages();
		this.updateImage();
	}

	updateDomainsOnPage(domain = Settings.getDomain()) {
		$('#view-comments').attr('href', `https://${domain}/${Cache.getImageData().id}#comments`);
		$('.anchor-domain').each(function() {
			const $el = $(this);
			if (typeof $el.attr('data-href') === 'undefined')
				$el.attr('data-href', $el.attr('href'));
			$el.attr('href', $el.attr('data-href').replace('domain.tld', domain));
		});
		$('.contents-domain').html(domain.replace('derpi','der&shy;pi&shy;').replace('trixie','trix&shy;ie&shy;'));
	}

	displayImageData(imageData = Cache.getImageData()) {
		if (!imageData.id)
			return;

		let tags = imageData.tags.split(', '),
			artists = [];

		$.each(tags, function(i, el) {
			if (el.indexOf('artist:') === 0)
				artists.push(el.substring(7));
		});

		let artistText = artists.length ? 'By ' + artists.join(', ').replace(/, ([^,]+)$/g, ' and $1') : 'Unknown Artist';

		const $artistList = $('#artist-list');
		const artistsLink = `<a href="https://domain.tld/${imageData.id}" class="anchor-domain">${artistText}</a>`;
		if (!$artistList.length)
			this.$data.html(`<h1 id="artist-list">${artistsLink}</h1>`);
		else $artistList.html(artistsLink);
		const $metadataList = $('#metadata-list');
		const score = imageData.upvotes - imageData.downvotes;
		const interactions = Cache.getInteractions();
		if (!$metadataList.length){
			this.$data.append(
				`<p id="metadata-list">
					<span class="id">${fa.hashtag}<span>${imageData.id}</span></span>
					<span class="uploader">${fa.upload}<span>${imageData.uploader.replace(/</g, '&lt;')}</span></span>
					<a class="faves${interactions.fave ? ' active' : ''}">${fa.star}<span>${imageData.faves}</span></a>
					<a class="upvotes votes${interactions.up ? ' active' : ''}">${fa.arrowUp}<span class="votecounts">${imageData.upvotes}</span></a>
					<span class="score"><span>${score}</span></span>
					<a class="downvotes votes${interactions.down ? ' active' : ''}">${fa.arrowDown}<span class="votecounts">${imageData.downvotes}</span></a>
					<a class="comments" id="view-comments">${fa.comments}<span>${imageData.comment_count}</span></a>
					<a class="hide">${fa.eyeSlash}</a>
				</p>`
			);
		}
		else {
			$metadataList.children('.uploader')
				.children().last().text(imageData.uploader);
			$metadataList.children('.faves').classIf(interactions.fave, 'active')
				.children().last().html(imageData.faves);
			$metadataList.children('.upvotes').classIf(interactions.up, 'active')
				.children().last().html(imageData.upvotes);
			$metadataList.children('.score')
				.children().last().html(score);
			$metadataList.children('.downvotes').classIf(interactions.down, 'active')
				.children().last().html(imageData.downvotes);
			$metadataList.children('.comments')
				.children().last().html(imageData.comment_count);
			$metadataList.children('.hide').classIf(interactions.hide, 'active');
		}

		this.setBackgroundStyles(imageData);
		this.updateDomainsOnPage();
		this.showImages();
	}

	setBackgroundStyles(imageData) {
		if (typeof imageData.image !== 'string')
			return;
		this.$body.removeClass('no-pony');
		this.hideImages();
		$(new Image()).attr('src', imageData.image).on('load', () => {
			let url = imageData.image.replace(/"/g, '%22');
			this.$style.html(
				'#image{background-image:url("' + url + '")}' +
				'#image-ghost{background-image:url("' + url + '")}'
			);
			this.$body.removeClass('loading');
			this.showImages();
		}).on('error', () => {
			this.$style.empty();
			this.$body.removeClass('loading').addClass('no-pony');
			this.hideImages();
		});
	}
}


export default (new Extension());
