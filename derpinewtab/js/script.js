/* global fa */
(function($){
	'use strict';

	fetch('manifest.json')
		.then(function(response) {
			response.json().then(data => {
				$('#version').text(' v' + data.version);
			});
		});

	//Setting check
	let settings = {
			allowedTags: [],
			metadata: {},
			domain: null,
			castVotes: {},
		},
		$settings = $('#settings'),
		$tagSettings = $('#tag-settings'),
		$body = $('body'),
		$metaSettings = $('#metadata-settings'),
		$domainSettings = $('#domain-settings'),
		$image = $('#image'),
		$imageGhost = $('#image-ghost'),
		$data = $('#data'),
		$style = $('#style'),
		$showSettingsButton = $('#show-settings-button'),
		$viewport = $('#viewport'),
		_currentImageURL,
		imageData = {};

	// Tag settings
	(function TagSettings(){
		let possibleTags = ['safe','suggestive','questionable','explicit','semi-grimdark','grimdark','grotesque'], tagSelectCountdownInterval;
		const allowed_tags = localStorage.getItem('setting_allowed_tags');
		if (allowed_tags){
			let setTags = allowed_tags.split(',');
			$.each(setTags,function(i,el){
				if (possibleTags.indexOf(el) > -1)
					settings.allowedTags.push(el);
			});
			if (settings.allowedTags.length > 0) localStorage.setItem('setting_allowed_tags',settings.allowedTags.join(','));
		}
		if (settings.allowedTags.length === 0){
			localStorage.setItem('setting_allowed_tags','safe');
			settings.allowedTags = ['safe'];
		}
		let $ratingTags = $settings.find('.rating-tags');
		$.each(possibleTags,function(i,el){
			$ratingTags.append(
				$(document.createElement('label')).append(
					$(document.createElement('input')).attr({
						type: 'checkbox',
						name: el,
						checked: settings.allowedTags.indexOf(el) > -1,
					}),
					'<span>'+el+'</span>'
				)
			);
		});
		function tagSelectionUpdate(){
			const tagArray = [];
			$ratingTags.children().each(function(i,el){
				let $input = $(el).find('input'),
					tag = $input.attr('name');
				if ($input.prop('checked'))
					tagArray.push(tag);
			});

			if (tagArray.length > 0){
				settings.allowedTags = tagArray;
				localStorage.setItem('setting_allowed_tags',tagArray.join(','));
				$image.css('opacity','0');
				$imageGhost.css('opacity','0');
				unbindHandlers();

				setTimeout(searchImage,300);
			}
		}
		function tagSelectCountdownStarter(){
			if (typeof tagSelectCountdownInterval === "number"){
				clearInterval(tagSelectCountdownInterval);
				tagSelectCountdownInterval = undefined;
			}

			let i = 6,
				tagSelectCountdown = function(){
					if (--i === 0){
						tagSelectionUpdate();
						return clearInterval(tagSelectCountdownInterval);
					}

					let $elem = $tagSettings.find('.re-request span').text(i+' second'+(i !== 1 ? 's':'')).parent();
					if (!$elem.is(':visible')) $elem.stop().hide().slideDown();
				};

			tagSelectCountdownInterval = setInterval(tagSelectCountdown,1000);
			tagSelectCountdown();
		}
		$settings.find('.rating-tags label span').on('click',function(e){
			e.preventDefault();

			let $thisInput = $(this).prev();
			$thisInput.prop('checked',!$thisInput.prop('checked'));

			tagSelectCountdownStarter();
		});
	})();
	// Domain settings
	(function DomainSettings(){
		const availDomains = ['derpibooru.org','trixiebooru.org'];
		let $select = $domainSettings.find('select');

		let domain = localStorage.getItem('setting_domain');
		if (domain && availDomains.indexOf(domain) !== -1)
			settings.domain = domain;
		else {
			settings.domain = availDomains[0];
			localStorage.setItem('setting_domain', settings.domain);
		}

		availDomains.forEach(el => {
			$select.append(`<option ${el===domain?'selected':''}>${el}</option>`);
		});

		$select.on('change',function(e){
			e.stopPropagation();

			const newDomain = $select.val();
			if (availDomains.indexOf(newDomain) === -1)
				return;

			settings.domain = newDomain;
			localStorage.setItem('setting_domain', settings.domain);
			updateDomain();
		});
	})();
	// Metadata settings
	(function MetadataSettings(){
		let $inputs = $metaSettings.find('.switch input'), keys;
		$inputs.each(function(){
			settings.metadata[this.name] = false;
		});

		if (!localStorage.getItem('setting_metadata')){
			keys = Object.keys(settings.metadata);
			localStorage.setItem('setting_metadata',keys.join(','));
		}
		else {
			keys = localStorage.getItem('setting_metadata');
			if (keys.length === 0) keys = [];
			else keys = keys.split(',');
		}

		$.each(keys,function(i,el){
			if (typeof settings.metadata[el] !== 'undefined')
				settings.metadata[el] = true;
			else delete keys[i];
		});

		function updateMetadataSettings(noUpdateKeys){
			if (noUpdateKeys !== true)
				localStorage.setItem('setting_metadata',keys.join(','));

			$inputs.each(function(){
				$('#data .'+this.name.replace(/^show/,''))[keys.indexOf(this.name) > -1?'show':'hide']();
			});

			$data.find('p span').filter(':visible').addClass('visible').last().removeClass('visible');
		}
		window.updateMetadataSettings = function(){ updateMetadataSettings() };

		updateMetadataSettings();

		$inputs.each(function(){
			this.checked = !!settings.metadata[this.name];
			$(this).prop('checked',this.checked);
		});
		$metaSettings.find('.switch input').on('click',function(e){
			e.stopPropagation();

			let nameAttr = this.name,
				attrIndex = keys.indexOf(nameAttr);

			if (attrIndex === -1) keys.push(nameAttr);
			else keys.splice(attrIndex, 1);

			updateMetadataSettings();
		});
	})();
	// Cast Vote tracking
	(function CastVoteTracking(){
		const storeCastVotes = data => {
			if (typeof data.up === 'boolean')
				settings.castVotes.up = data.up;
			if (typeof data.down === 'boolean')
				settings.castVotes.down = data.down;
			if (typeof data.fave === 'boolean')
				settings.castVotes.fave = data.fave;
			localStorage.setItem('setting_castVotes', JSON.stringify(settings.castVotes));
			if (imageData.id)
				metadata();
		};
		window.storeCastVotes = function(data){ storeCastVotes(data) };

		const castVotes = localStorage.getItem('setting_castVotes');
		if (!castVotes)
			updateVoteStatus();
		else {
			let parsed;
			try {
				parsed = JSON.parse(castVotes);
			}
			catch(e){
				localStorage.removeItem('setting_castVotes');
				updateVoteStatus();
			}
			if (typeof parsed !== 'undefined')
				storeCastVotes(parsed);
		}

		function updateVoteStatus(){
			if (!imageData.id)
				return;

			fetch(`https://${settings.domain}/${imageData.id}`, { credentials: "include" })
				.then(resp => resp.text())
				.then(resp => {
					const parser = new DOMParser();
					const $el = $(parser.parseFromString(resp, "text/html"));

					imageData.upvotes = parseInt($el.find('.interaction--upvote .upvotes').text(), 10);
					imageData.downvotes = parseInt($el.find('.interaction--downvote .downvotes').text(), 10);
					imageData.faves = parseInt($el.find('.interaction--fave .favourites').text(), 10);
					saveImageData();
					const interactions = JSON.parse($el.find('.js-datastore').attr('data-interactions'));
					const voteObj = {
						up: false,
						down: false,
						fave: false,
					};
					interactions.forEach(interact =>{
						switch (interact.interaction_type){
							case "voted":
								voteObj[interact.value] = true;
							break;
							case "faved":
								voteObj.fave = true;
							break;
						}
					});
					storeCastVotes(voteObj);
				});
		}
		window.updateVoteStatus = function(){ updateVoteStatus() };
	})();

	function isSignedIn(html){
		return /<\/head><body data-signed-in="true"/.test(html);
	}
	const getCSRFToken = (function(){
		let tokenCache = {};
		const useCacheForMethods = {
			PUT: true,
			GET: false,
		};
		return function(requestMethod){
			if (tokenCache.token && useCacheForMethods[requestMethod] === true)
				return new Promise(res => { res(tokenCache) });
			return new Promise((res, rej) => {
				fetch(`https://${settings.domain}/pages/about`, { credentials: 'include' })
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
		};
	})();
	function interact(endpoint, value){
		return new Promise((res, rej) => {
			const type = 'PUT';
			getCSRFToken(type).then(data => {
				if (!data.signed_in){
					alert('You must be signed in to vote. If you are signed in, try changing your domain in the settings.');
					return;
				}

		        $.ajax({
		            type,
		            url: `https://${settings.domain}/api/v2/interactions/${endpoint}`,
		            beforeSend: request => {
		                request.setRequestHeader('x-csrf-token', data.token);
		            },
					contentType: 'application/json',
		            data: JSON.stringify({
						"class": "Image",
						"id": imageData.id,
						"value": value,
						"_method": "PUT",
					}),
		            processData: false,
		            success: data => {
						imageData.faves = data.favourites;
						imageData.upvotes = data.upvotes;
						imageData.downvotes = data.downvotes;
						setImageData(imageData);
						metadata();
						res();
		            },
		            error: resp => {
		                // Already voted
		                if (resp.status === 409){
		                    vote('false').then(res).catch(rej);
		                    return;
		                }

						alert('Failed to vote');
						console.log(resp);
						rej(resp);
		            },
		        });
			}).catch(rej);
		});
	}
	function fave(way){
		return interact('fave', way);
	}
	function vote(way){
		return interact('vote', way);
	}
	$data.on('click', '.upvotes', function(){
		const $this = $(this);
		const active = $this.hasClass('active');
		vote(active ? 'false' : 'up').then(() => {
			$this[active  ? 'removeClass' : 'addClass']('active');
			const down = active ? void 0 : false;
			window.storeCastVotes({ up: !active, down });
		});
	});
	$data.on('click', '.downvotes', function(){
		const $this = $(this);
		const active = $this.hasClass('active');
		vote(active ? 'false' : 'down').then(() => {
			$this[active  ? 'removeClass' : 'addClass']('active');
			const up = active ? void 0 : false;
			window.storeCastVotes({ down: !active, up });
		});
	});
	$data.on('click', '.faves', function(){
		const $this = $(this);
		const active = $this.hasClass('active');
		fave(active ? 'false' : 'true').then(() => {
			$this[active  ? 'removeClass' : 'addClass']('active');
			const up = !active ? true : void 0;
			window.storeCastVotes({ fave: !active, up });
		});
	});

	// Background size updater
	function setBackgroundStyles(){
		if (typeof imageData.image === 'string')
			_currentImageURL = imageData.image;
		else if (typeof imageData.image !== 'string')
			return;
		let url = imageData.image.replace(/"/g, '%22'),
			styles = '#image{background-image:url("'+url+'")}';

			$imageGhost.css('opacity','');
			styles += '#image-ghost{background-image:url("'+url+'")}';

		$style.html(styles);
	}

	function updateDomain(){
		$('#view-comments').attr('href',`https://${settings.domain}/${imageData.id}#comments`);
		$('.anchor-domain').each(function(){
			const $el = $(this);
			if (typeof $el.attr('data-href') === 'undefined')
				$el.attr('data-href', $el.attr('href'));
			$el.attr('href',  $el.attr('data-href').replace('domain.tld', settings.domain));
		});
		$('.contents-domain').html(settings.domain);
	}

	// Begin site
	if (localStorage.getItem("image_search") && localStorage.getItem("image_hash")){
		setImageData(JSON.parse(localStorage.getItem("image_search")));
		setBackgroundStyles();
		$image.css('opacity','1').attr('data-hash',localStorage.getItem('image_hash'));
		metadata();
	}
	localStorage.removeItem("image_data");
	localStorage.removeItem("setting_crop");

	$viewport.on('click', '#show-settings-button', function(){
		if ($showSettingsButton.hasClass('disabled'))
			return;

		$body.toggleClass('sidebar-open');
	});
	$settings.on('click', '.clear', function(){
		$(this).closest('.error-block').hide();
	});

	searchImage();

	function searchImage(){
		if ($data.is(':empty'))
			$data.html('<h1>Requesting metadata&hellip;</h1>');
		$body.addClass('loading');
		$tagSettings.find('.re-request:visible').slideUp();

		const size = 'width.gte:1280+height.gte:720+width.lte:4096+height.lte:4096';

		fetch(
			`https://${settings.domain}/search.json?perpage=5&q=wallpaper+%26%26+(${settings.allowedTags.join('+%7C%7C+')})+%26%26+-equestria+girls+${size}`,
			{ credentials: 'include' }
		).then(request => {
			request.json().then(data => {
				let image;

				data = data.search;

				if (data.length === 0) {
					fadeIt();
					$body.removeClass('loading');
					$data.html('<h1>Search returned no results.</h1>' + (settings.allowedTags.indexOf('safe') === -1 ? '<p>Try enabling the safe system tag or logging in.</p>' : ''));
					return;
				}

				for (let i = 0; i < data.length; i++){
					if (!data[i].is_rendered)
						continue;

					image = data[i];
					break;
				}

				if (typeof image === 'undefined'){
					$body.removeClass('loading');
					$data.html('<h1>No rendered image found</h1><p>Try reloading in a minute or so</p>');
					fadeIt();
					return;
				}

				if (/^\/\//.test(image.image))
					image.image = 'https:'+image.image;

				imageFound(image);
			});
		}).catch(() => {
			$body.removeClass('loading');
			$data.html('<h1>There was an error while fetching the image data</h1><p>'+(navigator.onLine ? 'Derpibooru may be down for maintenance, try again later.' : 'You are not connected to the Internet.')+'</p>');
		});
	}

	function imageFound(image){
		if (!localStorage.getItem("image_search") ||!localStorage.getItem("image_hash") || localStorage.getItem("image_hash") !== image.sha512_hash){
			$(new Image()).attr('src',image.image).on('load',function(){
				setImageData(image);
				localStorage.setItem("image_hash", image.sha512_hash);

				metadata();
			}).on('error', function(){
				if (!image.is_rendered)
					$data.html('<h1>Image has not been rendered yet</h1><p>Try reloading in a minute or so</p>');
				else $data.html('<h1>Image failed to load</h1><p>Either the image is no longer available or the extension is broken</p>');
				fadeIt();
			});
		}
		else {
			imageData = image;
			saveImageData();
			metadata();
		}
	}
	function saveImageData(){
		localStorage.setItem("image_search", JSON.stringify(imageData));
	}
	function setImageData(image){
		imageData = image;
		saveImageData();
		window.updateVoteStatus();
		updateDomain();
	}

	function metadata(){
		let tags = imageData.tags.split(', '),
			artists = [];

		$.each(tags,function(i,el){
			if (el.indexOf('artist:') === 0)
				artists.push(el.substring(7));
		});

		let artistText = artists.length ? 'By '+artists.join(', ').replace(/, ([^,]+)$/g,' and $1') : 'Unknown Artist';

		const $artistList = $('#artist-list');
		const artistsLink = `<a href="https://domain.tld/${imageData.id}" class="anchor-domain">${artistText}</a>`;
		if (!$artistList.length)
			$data.html(`<h1 id="artist-list">${artistsLink}</h1>`);
		else $artistList.html(artistsLink);
		const $metadataList = $('#metadata-list');
		const score = imageData.upvotes - imageData.downvotes;
		if (!$metadataList.length){
			$data.append(
				`<p id="metadata-list">
					<span class="uploader">${fa.upload}<span>${imageData.uploader.replace(/</g,'&lt;')}</span></span>
					<a class="faves${settings.castVotes.fave?' active':''}">${fa.star}<span>${imageData.faves}</span></a>
					<a class="upvotes votes${settings.castVotes.up?' active':''}">${fa.arrowUp}<span>${imageData.upvotes}</span></a>
					<span class="score"><span>${score}</span></span>
					<a class="downvotes votes${settings.castVotes.down?' active':''}">${fa.arrowDown}<span>${imageData.downvotes}</span></a>
					<a class="comments" id="view-comments">${fa.comments}<span>${imageData.comment_count}</span></a>
				</p>`
			);
		}
		else {
			$metadataList.children('.uploader')
				.children().last().text(imageData.uploader);
			$metadataList.children('.faves')[settings.castVotes.fave?'addClass':'removeClass']('active')
				.children().last().html(imageData.faves);
			$metadataList.children('.upvotes')[settings.castVotes.up?'addClass':'removeClass']('active')
				.children().last().html(imageData.upvotes);
			$metadataList.children('.score')
				.children().last().html(score);
			$metadataList.children('.downvotes')[settings.castVotes.down?'addClass':'removeClass']('active')
				.children().last().html(imageData.downvotes);
			$metadataList.children('.comments')
				.children().last().html(imageData.comment_count);
		}
		window.updateMetadataSettings();
		updateDomain();

		$body.removeClass('loading');
		setBackgroundStyles();
		fadeIt();
	}

	function fadeIt(){
		$image.css('opacity', 1);

		$showSettingsButton.removeClass('disabled');
	}

	function closeSidebar(){
		$body.removeClass('sidebar-open');
	}

	function unbindHandlers(){
		$showSettingsButton.addClass('disabled');
		closeSidebar();
	}

	// First run dialog
	if (!localStorage.getItem('firstrun')){
		$(document.createElement('div'))
			.attr('id','dialog')
			.html('<div id="dialog-inner"><h1>Welcome to Derpi-New Tab</h1><p>To access the settings click the menu icon in the bottom left.<br><span style="opacity:.5">(this message is only displayed once)</span></p></div>')
			.children()
			.append($(document.createElement('button')).text('Got it').on('click',function(e){
				e.preventDefault();

				localStorage.setItem('firstrun','1');
				let $dialog = $('#dialog').addClass('gtfo');
				setTimeout(function(){
					$dialog.remove();
				}, 550);
			}))
			.end()
			.prependTo($body);
	}
})(jQuery);
