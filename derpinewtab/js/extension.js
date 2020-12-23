import Settings, {
  AVAILABLE_THEMES,
  DEFAULT_SETTINGS,
  DOMAINS,
  FALLBACK_UPLOADER,
  METABAR_DISAPPEAR_TIMEOUT,
  METABAR_OPAQUE_CLASS,
  METADATA_SETTINGS_KEYS,
  QUERY_CONTROL,
  RATING_TAGS,
  RESOLUTION_CAP,
  SEARCH_SETTINGS_KEYS,
  SIDEBAR_OPEN_CLASS,
} from './settings.js';
import csrfToken from './csrf-token.js';
import Cache from './local-cache.js';
import { isFirefox } from './firefox-detector.js';
import { requestDomainPermission } from './perms.js';
import fa from './fa.js';
import { fave, hide, vote } from './interactions.js';
import Connectivity from './connectivity.js';
import setHelper from './set-helper.js';

const { fromEvent } = rxjs;
const { map, throttleTime } = rxjs.operators;

const SEARCH_SETTINGS_CHECKBOX_KEYS = (() => {
  const SEARCH_SETTINGS_NON_CHECKBOX_KEYS = new Set([
    'tags',
    'domain',
    'filterId',
    'apiKey',
    'queryControl',
    'customQuery',
  ]);

  return Array.from(
    setHelper.difference(new Set(SEARCH_SETTINGS_KEYS), SEARCH_SETTINGS_NON_CHECKBOX_KEYS),
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
export const THEME_NAMES = {
  light: 'Default',
  dark: 'Dark',
  red: 'Red',
};

export const QUERY_CONTROL_NAMES = {
  simple: 'Simple',
  advanced: 'Advanced',
};

class Extension {
  constructor() {
    this.$settings = $('#settings');
    this.$version = $('#version');
    this.$searchSettings = $('#search-settings');
    this.$body = $('body');
    this.$image = $('#image');
    this.$imageGhost = $('#image-ghost');
    this.$webm = $('#webm');
    this.$metaSettings = $('#metadata-settings');
    this.$filterSettings = $('#filter-settings');
    this.$filterIdInput = $('#filter-id-input');
    this.$apiKeyInput = $('#api-key-input');
    this.$saveFilterId = $('#save-filter-id');
    this.$resetFilterId = $('#reset-filter-id');
    this.$fetchCurrentFilter = $('#fetch-current-filter');
    this.$domainSettings = $('#domain-settings');
    this.$themeSettings = $('#theme-settings');
    this.$ffDomainApply = $('#firefox-domain-apply');
    this.$data = $('#data');
    this.$style = $('#style');
    this.$viewport = $('#viewport');
    this.$clearSettings = $('#clear-settings');
    this.$searchLink = $('#search-link');
    this.$showSettingsButton = $('#show-settings-button');
    this.$rescapWidth = $('#rescap-width');
    this.$rescapHeight = $('#rescap-height');
    this.$noRatingTags = $('#no-rating-tags');
    this.$metadataArea = $('#metadata-area');
    this.$queryControlSettings = $('#query-control-settings');
    this.$showQuerySimple = $('#show-query-simple');
    this.$showQueryAdvanced = $('#show-query-advanced');
    this.$customQueryInput = $('#custom-query-input');

    this.$ratingTags = this.$settings.find('.rating-tags');
    this.$domainSelect = this.$domainSettings.find('select');
    this.searchSettingsInputs = {};
    SEARCH_SETTINGS_CHECKBOX_KEYS.forEach(key => {
      this.searchSettingsInputs[key] = this.$searchSettings.find(`input[name="${key}"]`);
    });

    this.updatingImage = false;
    this.fetchController = null;
    this.metabarTimeout = null;

    this.searchSettingsRefreshCountdownInterval = undefined;

    this.handleDomainChange = this.handleDomainChange.bind(this);
    this.resetDomainSelect = this.resetDomainSelect.bind(this);
    this.updateImage = this.updateImage.bind(this);
  }

  async init() {
    await Settings.init();
    // Try to avoid FOUC by doing this ASAP
    this.subscribeToTheme();

    this.$version.text(' v' + chrome.runtime.getManifest().version);
    this.$rescapWidth.text(RESOLUTION_CAP[0]);
    this.$rescapHeight.text(RESOLUTION_CAP[1]);

    await Cache.init();

    this.processIcons();
    this.createElements();
    this.createSubscriptions();
    this.attachEventHandlers();
    this.handleFirstRun();
  }

  subscribeToTheme() {
    Settings.theme.subscribe(theme => {
      setTimeout(() => {
        if (this.$themeRadios){
          this.$themeRadios.each((_, el) => {
            el.checked = el.value === theme;
          });
        }
        const $root = $('html');
        const rootClasses = $root.attr('class');
        const newThemeClass = `theme-${theme}`;
        if (typeof rootClasses === 'string'){
          const themeClassMatch = rootClasses.match(/theme-[a-z]+/);
          if (themeClassMatch)
            $root.removeClass(themeClassMatch[0]);
        }
        $root.addClass(newThemeClass);
      });
    });
  }

  processIcons() {
    $('.fa[data-fa]').each((_, el) => el.innerHTML = fa[el.dataset.fa]);
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
          `<span class="tag" data-tag-category="rating">${el}</span>`,
        ),
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
        $(document.createElement('label')).attr('class', 'switch').append(
          $(document.createElement('input')).attr({
            type: 'checkbox',
            name: key,
          }).prop('checked', settingValue),
          `<span class="lever"></span>`,
          $(document.createElement('span')).text(METADATA_SETTING_NAMES[key]),
        ),
      );
    });
    this.$metaToggles = this.$metaSettings.find('.switch input');

    // Theme settings
    const currentTheme = Settings.getTheme();
    AVAILABLE_THEMES.forEach(theme => {
      this.$themeSettings.append(
        $(document.createElement('label')).attr('class', 'switch').append(
          $(document.createElement('input')).attr({
            type: 'checkbox',
            name: 'theme',
            value: theme,
          }).prop('checked', currentTheme === theme),
          `<span class="button"></span>`,
          $(document.createElement('span')).text(THEME_NAMES[theme]),
        ),
      );
    });
    this.$themeRadios = this.$themeSettings.find('.switch input');

    // Query control settings
    const currentQueryControl = Settings.getQueryControl();
    QUERY_CONTROL.forEach(queryControl => {
      this.$queryControlSettings.append(
        $(document.createElement('label')).attr('class', 'switch').append(
          $(document.createElement('input')).attr({
            type: 'checkbox',
            name: 'queryControl',
            value: queryControl,
          }).prop('checked', currentQueryControl === queryControl),
          `<span class="button"></span>`,
          $(document.createElement('span')).text(QUERY_CONTROL_NAMES[queryControl]),
        ),
      );
    });
    this.$queryControlRadios = this.$queryControlSettings.find('.switch input');

    // Set stored value into custom query input field
    this.$customQueryInput.val(Settings.getCustomQuery());
  }

  createSubscriptions() {
    Cache.interactions.subscribe(() => this.displayImageData());
    Cache.imageData.subscribe(imageData => this.displayImageData(imageData));

    Settings.searchLink.subscribe(link => {
      this.$searchLink.attr('href', link.replace('/api/v1/json/search/images?per_page=5&', '/search?'));
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
    Settings.filterId.pipe(
      map(value => value === null ? '' : value),
    ).subscribe(filterId => {
      this.$filterIdInput.val(filterId);
      this.$resetFilterId.attr('disabled', filterId === null || filterId === DEFAULT_SETTINGS.filterId);
    });
    Settings.apiKey.pipe(
      map(value => value === null ? '' : value),
    ).subscribe(apiKey => this.$apiKeyInput.val(apiKey));
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
    Settings.queryControl.subscribe(selectedControl => {
      setTimeout(() => {
        this.$queryControlRadios.each((_, el) => {
          el.checked = el.value === selectedControl;
        });
        this.$showQuerySimple.add(this.$showQueryAdvanced).each((_, el) => {
          $(el).attr('hidden', el.id.indexOf(selectedControl) === -1);
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
      const hasClass = this.$body.hasClass(SIDEBAR_OPEN_CLASS);
      if (hasClass){
        this.$body.removeClass(SIDEBAR_OPEN_CLASS);
        this.startMetabarTimer();
      }
      else {
        this.$body.addClass(SIDEBAR_OPEN_CLASS);
        this.stopMetabarTimer();
      }
    });

    this.$body.addClass('interactive');

    if (isFirefox){
      this.$ffDomainApply.on('click', this.handleDomainChange);
      this.$domainSelect.on('change', () => {
        this.$ffDomainApply.prop('disabled', this.$domainSelect.val() === Settings.getDomain());
      });
    }
    else {
      this.$ffDomainApply.remove();
      this.$domainSelect.on('change', this.handleDomainChange);
    }
    this.$showQuerySimple.find('input').on('click', () => {
      if (typeof this.searchSettingsRefreshCountdownInterval === 'number'){
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
    this.$metaToggles.on('click', e => {
      e.preventDefault();

      const { name } = e.target;

      Settings.toggleSetting(name);
    });
    this.$themeRadios.add(this.$queryControlRadios).on('click', e => {
      e.preventDefault();

      const { name, value } = e.target;

      Settings.setSetting(name, value);
    });
    this.$clearSettings.on('click', e => {
      e.preventDefault();

      if (!confirm('This will clear all data from the extension\'s local storage. Any cached image data will be removed along with your settings.\n\nReady to start fresh?'))
        return;

      localStorage.clear();
      location.reload();
    });
    const getFilterIdFromInputValue = value => value.length === 0 ? DEFAULT_SETTINGS.filterId : parseInt(value, 10);
    const getApiKeyFromInputValue = value => value.length === 0 ? null : value.trim();
    const $filterErrorBlock = this.$filterSettings.find('.error-block').stop();
    let filterApplyHandlerDebounce = null;
    const filterApplyStateUpdate = () => {
      if (filterApplyHandlerDebounce) {
        return;
      }
      filterApplyHandlerDebounce = setTimeout(() => {
        const filterIdValue = getFilterIdFromInputValue(this.$filterIdInput.val());
        const filterIdMatchesSetting = filterIdValue === Settings.getFilterId();
        const filterIdMatchesDefault = filterIdValue === DEFAULT_SETTINGS.filterId;

        const apiKeyValue = getApiKeyFromInputValue(this.$apiKeyInput.val());
        const apiKeyMatchesSetting = apiKeyValue === Settings.getApiKey();
        const apiKeyMatchesDefault = apiKeyValue === DEFAULT_SETTINGS.apiKey;

        this.$saveFilterId.attr('disabled', filterIdMatchesSetting && apiKeyMatchesSetting);
        this.$resetFilterId.attr('disabled', filterIdMatchesDefault && apiKeyMatchesDefault);

        clearTimeout(filterApplyHandlerDebounce);
        filterApplyHandlerDebounce = null;
      }, 100);
    };
    this.$filterIdInput.on('keydown keyup change', filterApplyStateUpdate);
    this.$apiKeyInput.on('keydown keyup change', filterApplyStateUpdate);
    filterApplyStateUpdate();

    this.$filterSettings.on('submit', 'form', async (e) => {
      e.preventDefault();

      const filterIdString = this.$filterIdInput.val();
      const filterId = getFilterIdFromInputValue(filterIdString);

      const apiKeyString = this.$apiKeyInput.val();
      const apiKey = getApiKeyFromInputValue(apiKeyString);
      $filterErrorBlock.stop();
      try {
        await Settings.setSettings({ filterId, apiKey});
      } catch (e){
        console.error(e);
        $filterErrorBlock.slideDown();
        this.$filterIdInput.focus();
        return;
      }

      $filterErrorBlock.slideUp();
      this.hideImages();
      this.updateImage();
    });
    this.$filterSettings.on('reset', 'form', async (e) => {
      e.preventDefault();

      await Settings.setSetting('filterId', DEFAULT_SETTINGS.filterId);
      await Settings.setSetting('apiKey', DEFAULT_SETTINGS.apiKey);

      $filterErrorBlock.stop().slideUp();
      this.hideImages();
      this.updateImage();
    });
    this.$fetchCurrentFilter.on('click', async e => {
      e.preventDefault();

      this.$fetchCurrentFilter.attr('disabled', true);
      let apiKey, filterId;
      try {
        let data = await Settings.fetchCurrentFilter();
        [apiKey, filterId] = [data.apiKey, data.filterId];
      } catch (e){
        alert(`Could not fetch filters settings: ${e.message}\nThe JavaScript console may contain additional information.`);
        console.error(e);
        this.$fetchCurrentFilter.attr('disabled', false);
        return;
      }

      this.$fetchCurrentFilter.attr('disabled', false);
      await Settings.setSetting('filterId', filterId);
      await Settings.setSetting('apiKey', apiKey);

      $filterErrorBlock.stop().slideUp();
      this.hideImages();
      this.updateImage();
    });
    this.$metadataArea.on('mouseenter', () => this.stopMetabarTimer());
    this.$customQueryInput.on('keyup change', () => {
      if (this.customQueryInputDebounceTimeout) {
        clearTimeout(this.customQueryInputDebounceTimeout);
      }
      this.customQueryInputDebounceTimeout = setTimeout(() => {
        if (Settings.getQueryControl() === 'advanced') {
          Settings.setSetting('customQuery', this.$customQueryInput.val());
        }
      }, 1e3);
    });

    const $body = this.$body;
    this.$data.on('click', '.upvotes', function() {
      if (!$body.hasClass('interactive'))
        return;

      const $this = $(this);
      const active = $this.hasClass('active');
      vote(active, true).then(() => {
        $this.classIf(!active, 'active');
        const down = active ? undefined : false;
        Cache.setInteractions({ up: !active, down });
      });
    });
    this.$data.on('click', '.downvotes', function() {
      if (!$body.hasClass('interactive'))
        return;

      const $this = $(this);
      const active = $this.hasClass('active');
      vote(active, false).then(() => {
        $this.classIf(!active, 'active');
        const up = active ? void 0 : false;
        Cache.setInteractions({ down: !active, up });
      });
    });
    this.$data.on('click', '.faves', function() {
      if (!$body.hasClass('interactive'))
        return;

      const $this = $(this);
      const active = $this.hasClass('active');
      fave(active).then(() => {
        $this.classIf(!active, 'active');
        const up = !active ? true : undefined;
        const down = !active ? false : undefined;
        Cache.setInteractions({ fave: !active, up, down });
      });
    });
    this.$data.on('click', '.hide', function() {
      if (!$body.hasClass('interactive'))
        return;

      const $this = $(this);
      const active = $this.hasClass('active');
      hide(active).then(() => {
        $this.classIf(!active, 'active');
        Cache.setInteractions({ hide: !active });
      });
    });
  }

  handleFirstRun() {
    if (localStorage.getItem('oobe_modal')){
      if (document.readyState === 'complete')
        this.attachMetabarTimerHandler();
      else fromEvent(window, 'load').subscribe(() => this.attachMetabarTimerHandler());
      return;
    }

    const $dialog = $('#dialog');
    const $dialogCompanion = $('#dialog-companion');
    const $dialogContinue = $dialog.find('.continue');
    const $dialogButtons = $dialog.find('button');
    const $nextButton = $dialogButtons.filter('.next');
    const $closeButton = $dialogButtons.filter('.close');
    const $themeList = $('#theme-list');

    $nextButton.on('click', e => {
      e.preventDefault();

      $nextButton.hide();
      if ($dialogContinue.is(':hidden:not(:animated)')){
        $dialogContinue.slideDown();
        $dialogCompanion.removeClass('hidden');
        $dialog.addClass('continued');
      }
    });
    AVAILABLE_THEMES.forEach(theme => {
      $themeList.append(
        $(document.createElement('li')).attr('data-theme', theme).html(
          `<span class="fa">${fa.palette}</span><span>${THEME_NAMES[theme]}</span>`,
        ).on('click', async e => {
          const $li = $(e.target).closest('li');
          await Settings.setSetting('theme', $li.attr('data-theme'));
        }),
      );
    });
    this.stopMetabarTimer();
    $dialog.removeClass('hidden');
    $dialog.find('.to-menu').on('click', () =>
      this.$showSettingsButton.trigger('click'),
    );
    $closeButton.on('click', e => {
      e.preventDefault();

      localStorage.setItem('oobe_modal', 'shown');
      $dialog.addClass('gtfo');
      this.attachMetabarTimerHandler();
      setTimeout(() => {
        $dialog.remove();
      }, 550);
    });
  }

  attachMetabarTimerHandler() {
    const handler = (restart = true, initial = false) => {
      this.stopMetabarTimer();
      if (restart)
        this.startMetabarTimer(initial);
    };
    fromEvent(document, 'mousemove').pipe(
      throttleTime(200),
      map(() => {
        const bodyHasClass = this.$body.hasClass(SIDEBAR_OPEN_CLASS);
        const barHover = this.$metadataArea.is(':hover');
        return !bodyHasClass && !barHover;
      }),
    ).subscribe(restart => handler(restart));
    handler(true, true);
  }

  startMetabarTimer(initial = false) {
    this.metabarTimeout = setTimeout(() => {
      this.$metadataArea.addClass(METABAR_OPAQUE_CLASS).css('bottom', `-${this.$metadataArea.outerHeight()}px`);
    }, METABAR_DISAPPEAR_TIMEOUT * (initial ? 2 : 1));
  }

  stopMetabarTimer() {
    if (this.metabarTimeout !== null){
      clearTimeout(this.metabarTimeout);
      this.metabarTimeout = null;
    }
    this.$metadataArea.removeClass(METABAR_OPAQUE_CLASS).css('bottom', '0px');
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
    const err = error => {
      if (!cachedImageData.id)
        this.$data.html('<h1>There was an error while fetching the image data</h1><p>' + (isOffline ? 'You are not connected to the Internet.' : 'Derpibooru may be down for maintenance, try again later.') + '</p>');
      else {
        if (error)
          console.error(error);
        console.error('There was an error while searching for new images, keeping last cached state silently');
      }
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

      const isWebm = image.format === 'webm';
      const $el = this._createElementForSrc(image.view_url, isWebm);
      const event = isWebm ? 'canplay' : 'load';

      $el.one(event, () => {
        this.updatingImage = false;
        this.$body.removeClass('loading');
        Cache.setImageData(image);
      }).one('error', e => {
        console.error(e);
        if (isWebm ? !image.processed : !image.is_rendered)
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
        err(msgs);
        return;
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
    $('.contents-domain').html(domain.replace('derpi', 'der&shy;pi&shy;').replace('trixie', 'trix&shy;ie&shy;'));
  }

  displayImageData(imageData = Cache.getImageData()) {
    if (!imageData.id)
      return;

    let { tags } = imageData,
      artists = [];

    $.each(tags, function(i, el) {
      if (el.startsWith('artist:'))
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
      const uploader = imageData.uploader || FALLBACK_UPLOADER;
      this.$data.append(
        `<p id="metadata-list">
					<span class="id"><span class="fa">${fa.hashtag}</span><span>${imageData.id}</span></span>
					<span class="uploader"><span class="fa">${fa.upload}</span><span>${uploader.replace(/</g, '&lt;')}</span></span>
					<a class="faves${interactions.fave ? ' active' : ''}"><span class="fa">${fa.star}</span><span>${imageData.faves}</span></a>
					<a class="upvotes votes${interactions.up ? ' active' : ''}"><span class="fa">${fa.arrowUp}</span><span class="votecounts">${imageData.upvotes}</span></a>
					<span class="score"><span>${score}</span></span>
					<a class="downvotes votes${interactions.down ? ' active' : ''}"><span class="fa">${fa.arrowDown}</span><span class="votecounts">${imageData.downvotes}</span></a>
					<a class="comments" id="view-comments"><span class="fa">${fa.comments}</span><span>${imageData.comment_count}</span></a>
					<a class="hide"><span class="fa">${fa.eyeSlash}</span></a>
				</p>`,
      );
    }
    else {
      $metadataList.children('.uploader')
        .children().last().text(imageData.uploader || FALLBACK_UPLOADER);
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

    this.updateDomImages(imageData);
    this.updateDomainsOnPage();
    this.showImages();
  }

  updateDomImages(imageData) {
    const prop = 'view_url';
    const src = imageData[prop];
    if (typeof src !== 'string'){
      console.warn(`setBackgroundStyles called with object that does not have string property ${prop}`);
      return;
    }
    this.$body.removeClass('no-pony');
    this.hideImages();
    const isWebm = imageData.format === 'webm';
    const $element = this._createElementForSrc(src, isWebm);
    if (isWebm) {
      if ($element.html() !== this.$webm.children().first().html()) {
        this.$webm.html($element);
      }
      this.$style.empty();
      this.$image.empty();
      this.$imageGhost.empty();
      $element.one('canplay', () => {
        if (Cache.getImageData().id !== imageData.id) {
          return;
        }
        this.$body.removeClass('loading');
        this.showImages();
      }).on('error', () => {
        if (Cache.getImageData().id !== imageData.id) {
          return;
        }
        this.$body.removeClass('loading').addClass('no-pony');
        this.hideImages();
      });
    }
    else {
      this.$webm.empty();
      $element.one('load', () => {
        if (Cache.getImageData().id !== imageData.id) {
          return;
        }
        let url = src.replace(/"/g, '%22');
        this.$style.html(
          '#image{background-image:url("' + url + '")}' +
          '#image-ghost{background-image:url("' + url + '")}',
        );
        this.$body.removeClass('loading');
        this.showImages();
      }).one('error', e => {
        console.error(e);
        if (Cache.getImageData().id !== imageData.id) {
          return;
        }
        this.$style.empty();
        this.$body.removeClass('loading').addClass('no-pony');
        this.hideImages();
      });
    }
  }

  _createElementForSrc(src, isWebm) {
    if (isWebm) {
      return $(document.createElement('video')).prop({
        muted: true,
        autoplay: true,
        preload: true,
        loop: true,
        playsInline: true,
      }).append(
        $(document.createElement('source')).attr({
          src: src.replace(/\.webm$/, '.mp4'),
          type: 'video/mp4'
        }),
        $(document.createElement('source')).attr({ src, type: 'video/webm' })
      );
    }

    return $(new Image()).prop('src', src);
  }
}


export default (new Extension());
