import setHelper from './set-helper.js';
import { checkDomainPermissions } from './perms.js';
import { isFirefox } from './firefox-detector.js';

const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

const LS_KEY = 'settings';
export const FALLBACK_UPLOADER = 'Background Pony';
export const RATING_TAGS = new Set(['safe', 'suggestive', 'questionable', 'explicit', 'semi-grimdark', 'grimdark', 'grotesque']);
export const AVAILABLE_THEMES = new Set(['light', 'dark', 'red']);
export const QUERY_CONTROL = new Set(['simple', 'advanced']);
export const DEFAULT_DOMAIN = 'derpibooru.org';
export const DOMAINS = new Set([DEFAULT_DOMAIN, 'www.derpibooru.org', 'trixiebooru.org']);
export const RESOLUTION_CAP = [4096, 4096]; // w, h
export const METABAR_DISAPPEAR_TIMEOUT = 1000;
export const METABAR_OPAQUE_CLASS = 'mouse-stopped';
export const SIDEBAR_OPEN_CLASS = 'sidebar-open';
export const SEARCH_SETTINGS_KEYS = [
  'tags',
  'andtags',
  'exclude',
  'eqg',
  'hd',
  'rescap',
  'domain',
  'filterId',
  'apiKey',
  'queryControl',
  'customQuery'
];
export const METADATA_SETTINGS_KEYS = (() => {
  const base = [
    'showId',
    'showUploader',
    'showFaves',
    'showScore',
    'showVotes',
    'showVoteCounts',
    'showComments',
    'showHide',
  ];
  if (!isFirefox){
    const pointlessSettings = ['showVoteCounts', 'showHide'];
    return base.filter(item => !pointlessSettings.includes(item));
  }
  return base;
})();
export const DEFAULT_SETTINGS = {
  tags: ['safe'],
  andtags: false,
  exclude: true,
  eqg: false,
  hd: true,
  rescap: true,
  filterId: 100073,
  apiKey: null,
  domain: DEFAULT_DOMAIN,
  showId: true,
  showUploader: true,
  showFaves: true,
  showScore: true,
  showVotes: true,
  showVoteCounts: true,
  showComments: true,
  showHide: true,
  theme: getDefaultTheme(),
  queryControl: 'simple',
  customQuery: null,
};

// Detect system dark mode setting and use appropriate default theme
function getDefaultTheme() {
  const supportsPrefersColorScheme = window.matchMedia('(prefers-color-scheme)').media !== 'not all';
  const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches === true;
  const defaultTheme = supportsPrefersColorScheme && prefersDarkMode ? 'dark' : 'light';
  document.body.classList.add(`theme-${defaultTheme}`);
  return defaultTheme;
}

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

  getFilterId() {
    return this.searchSources.filterId.value;
  }

  getApiKey() {
    return this.searchSources.apiKey.value;
  }

  getAndTags() {
    return this.searchSources.andtags.value;
  }

  getExclude() {
    return this.searchSources.exclude.value;
  }

  getQueryControl() {
    return this.searchSources.queryControl.value;
  }

  getCustomQuery() {
    return this.searchSources.customQuery.value;
  }

  getSearchLink() {
    return this.searchLinkSource.value;
  }

  getTheme() {
    return this.themeSource.value;
  }

  getMetaByKey(key) {
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

    this.themeSource = new BehaviorSubject(DEFAULT_SETTINGS.theme);
    this.theme = this.themeSource.asObservable().pipe(distinctUntilChanged());
  }

  /** @private */
  _getTagsQuery() {
    const allowedQuery = new Set(this.getTags());
    const finalQuery = [
      Array.from(allowedQuery).join(this.getAndTags() !== true ? ' OR ' : ' AND '),
    ];
    if (this.getExclude() === true){
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
  _getFilterIdQuery() {
    const filterId = this.getFilterId();
    if (typeof filterId !== 'number')
      return '';
    const apiKey = this.getApiKey();
    return `&filter_id=${filterId}${typeof apiKey === 'string' ? `&key=${apiKey}` : ''}`;
  }

  /** @private */
  _generateSearchQuery() {
    if (this.getQueryControl() === 'advanced') {
      const customQuery = this.getCustomQuery();
      return typeof customQuery === 'string' ? customQuery.replace(/\n/g, ' ') : '*';
    }

    let size = (this.getHD() ? ['width.gte:1280', 'height.gte:720'] : []);
    if (this.getResCap() === true)
      size = size.concat([`width.lte:${RESOLUTION_CAP[0]}`, `height.lte:${RESOLUTION_CAP[1]}`]);
    let query = ['wallpaper', this._getTagsQuery()];
    if (this.getEQG() !== true)
      query.push('-equestria girls');
    if (size.length > 0)
      query = query.concat(size);
    return query.join(' AND ');
  }

  /** @private */
  _generateSearchLink() {
    const q = encodeURIComponent(this._generateSearchQuery()).replace(/%20/g, '+');
    const filter = this._getFilterIdQuery();
    return `https://${this.getDomain()}/api/v1/json/search/images?per_page=5&q=${q}${filter}`;
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
      localStorage.removeItem('firstrun');
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
      this.themeSource.next(this._settings.theme);
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
          if (!isFirefox){
            target.domain = DEFAULT_DOMAIN;
            res();
          }
          else if (DOMAINS.has(value)){
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
        case 'filterId':
          if (value === null) {
            target[name] = DEFAULT_SETTINGS.filterId;
          } else {
            if (typeof value !== 'number' || isNaN(value) || !isFinite(value) || value < 1){
              if (strict){
                rej();
                return;
              }

              target[name] = DEFAULT_SETTINGS.filterId;
              res();
              return;
            }
            target[name] = value;
          }
          break;
        case 'apiKey':
          target[name] = value;
          break;
        case 'theme':
          if (AVAILABLE_THEMES.has(value))
            target[name] = value;
          break;
        case 'queryControl':
          if (QUERY_CONTROL.has(value))
            target[name] = value;
          break;
        case 'customQuery':
          target[name] = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
          break;
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

    for (let key of SEARCH_SETTINGS_KEYS.concat(METADATA_SETTINGS_KEYS, ['theme']))
      await this._setSetting(key, tempSettings, verifiedSettings);

    this.setSettings(verifiedSettings);
  }

  async fetchCurrentFilter() {
    return new Promise((res, rej) => {
      const fetchDomain = this.getDomain();
      fetch(`https://${fetchDomain}/registrations/edit`, {
        redirect: 'manual',
        credentials: 'include',
      })
        .then(resp => {
          if (!resp.ok)
            throw new Error(`You are not signed in on ${fetchDomain}`);
          return resp.text();
        })
        .then(resp => {
          const parser = new DOMParser();
          const $page = $(parser.parseFromString(resp, 'text/html'));
          const $quickMenu = $page.find('#filter-quick-menu');
          if ($quickMenu.length > 0){
            const $code = $page.find('code').first();
            if ($code.length > 0){
              res({ filterId: parseInt($quickMenu.find('option:selected').attr('value'), 10), apiKey: $code.text() });
              return;
            }
          }
          rej(resp);
        })
        .catch(rej);
    });
  }
}


const instance = new Settings();

export default instance;
