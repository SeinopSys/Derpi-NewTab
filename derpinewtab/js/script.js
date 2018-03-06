/* global moment */
(function($){
	'use strict';

	$.getJSON('manifest.json',function(data){
		if (!data) return;

		$('#disp-version').text(' v'+data.version);
	});

	//Setting check
	let settings = {
			allowedTags: [],
			metadata: {},
			crop: undefined,
		},
		$settingsWrap = $('#settingsWrap'),
		$settings = $('#settings'),
		$tagSettings = $('#tag-settings'),
		$body = $('body'),
		$metaSettings = $('#metadata-settings'),
		$cropSettings = $('#crop-settings'),
		$image = $('#image'),
		$imageGhost = $('#image-ghost'),
		$fadeLayer = $('#fade-layer'),
		$data = $('#data'),
		$style = $('#style'),
		$showSettingsButton = $('#show-settings-button'),
		_currentImageURL;

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
		let $systags = $settings.find('.systags');
		$.each(possibleTags,function(i,el){
			$systags.append(
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
		function tagselectUpdate(){
			const tagArray = [];
			$systags.children().each(function(i,el){
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
						tagselectUpdate();
						return clearInterval(tagSelectCountdownInterval);
					}

					let $elem = $tagSettings.find('.re-request span').text(i+' second'+(i !== 1 ? 's':'')).parent();
					if (!$elem.is(':visible')) $elem.stop().hide().slideDown();
				};

			tagSelectCountdownInterval = setInterval(tagSelectCountdown,1000);
			tagSelectCountdown();
		}
		$settings.find('.systags label span').on('click',function(e){
			e.preventDefault();

			let $thisInput = $(this).prev();
			$thisInput.prop('checked',!$thisInput.prop('checked'));

			tagSelectCountdownStarter();
		});

		const filter_id = localStorage.getItem('setting_filterid');
		if (filter_id)
			localStorage.removeItem('setting_filterid');
	})();
	// Metadata settings
	(function MatadataSettings(){
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
		
		function updateMetadataSettings(noupdatekeys){
			if (noupdatekeys !== true) localStorage.setItem('setting_metadata',keys.join(','));
			
			$inputs.each(function(){
				$('#data .'+this.name.substring(4))[keys.indexOf(this.name) > -1?'show':'hide']();
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
				attrIndx = keys.indexOf(nameAttr);
			
			if (attrIndx === -1) keys.push(nameAttr);
			else keys.splice(attrIndx, 1);
			
			updateMetadataSettings();
		});
	})();
	// Image cropping settings
	(function ImageCroppingSettings(){
		let $select = $cropSettings.find('.input-field select');

		if (!localStorage.getItem('setting_crop')){
			settings.crop = 'contain';
			localStorage.setItem('setting_crop', settings.crop);
		}
		else settings.crop = localStorage.getItem('setting_crop');

		function updateCroppingSettings(){
			let setTo = settings.crop;
			if (['contain','cover','100% 100%'].indexOf(setTo) === -1)
				setTo = 'cover';

			localStorage.setItem('setting_crop', setTo);
			settings.crop = setTo;
			$select.val(setTo);
			setBackgroundStyles();
		}
		window.updateCroppingSettings = function(){ updateCroppingSettings() };

		updateCroppingSettings();

		$select.on('change',function(){
			settings.crop = $select.val();

			updateCroppingSettings();
		});
	})();

	// Background size updater
	function setBackgroundStyles(image_url){
		if (typeof image_url === 'string')
			_currentImageURL = image_url;
		else if (typeof _currentImageURL !== 'string')
			return;
		let url = _currentImageURL.replace(/"/g, '%22'),
			styles = '#image{background-image:url("'+url+'");background-size:'+settings.crop+'}';
		if (settings.crop === 'contain'){
			$imageGhost.css('opacity','');
			styles += '#image-ghost{display:block;background-image:url("'+url+'")}';
		}

		$style.html(styles);
	}

	// Begin site
	if (localStorage.getItem("image_data") && localStorage.getItem("image_hash")){
		setBackgroundStyles(localStorage.getItem("image_data"));
		$image.css('opacity','1').attr('data-hash',localStorage.getItem('image_hash'));
	}

	searchImage();

	$data.html('<h1>Requesting metadata...</h1>').css('opacity', 1);
	function searchImage(page){
		$body.addClass('loading');
		$tagSettings.find('.re-request:visible').slideUp();

		const size = 'width.gte:1280+height.gte:720+width.lte:4096+height.lte:4096';

		$.ajax({
			url: 'https://derpibooru.org/search.json?perpage=5&min_score=5'+
			        '&q=wallpaper+%26%26+('+settings.allowedTags.join('+%7C%7C+')+')+%26%26+-equestria+girls+'+size+
			        (typeof page === 'number' ? '&page='+page : ''),
			success: function(data){
				let image, imgElement = new Image();
				
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
					$data.html('<h1>No rendered image found</h1><p>Try reloading in a minute or so</p>');
					fadeIt();
					return;
				}
				
				if (!localStorage.getItem("image_hash") || localStorage.getItem("image_hash") !== image.sha512_hash){
					if (typeof page === 'undefined')
						$data.html('<h1>Searching for new image...</h1>').css('opacity','1');
					
					imgElement.src = 'http:'+image.image;
					$(imgElement).on('load',function(){
						localStorage.setItem("image_data", imgElement.src);
						localStorage.setItem("image_hash", image.sha512_hash);
						
						metadata(image, imgElement.src);
					}).on('error', function(){
						if (!image.is_rendered)
							$data.html('<h1>Image has not been rendered yet</h1><p>Try reloading in a minute or so</p>');
						else $data.html('<h1>Image failed to load</h1><p>Either the image is no longer available or the extension is broken</p>');
						fadeIt();
					});
				}
				else metadata(image, getCachedIMGURL());
			},
			error: function(){
				$body.removeClass('loading');
				$data.html('<h1>There was an error while fetching the image data</h1><p>'+(navigator.onLine ? 'Derpibooru may be down for maintenance, try again later.' : 'You are not conected to the Internet.')+'</p>');
			}
		});
		
		function metadata(image,cachedurl){
			let tags = image.tags.split(', '),
				artists = [];
			
			$.each(tags,function(i,el){
				if (el.indexOf('artist:') === 0)
					artists.push(el.substring(7));
			});
			
			let artistText = artists.length ? 'By '+artists.join(', ').replace(/, ([^,]+)$/g,' and $1') : 'Unknown Artist';
			
			$data.empty().append(`<h1><a href="https://derpibooru.org/${image.id}">${artistText}</a></h1>`);

			$data.children('h1').simplemarquee({
			    speed: 25,
			    cycles: Infinity,
			    space: 25,
			    handleHover: false,
			    delayBetweenCycles: 0,
			});
			
			let votestr = '',
				cc = image.comment_count,
				fc = image.faves;
			if (image.upvotes + image.downvotes === 0) votestr = 'no votes';
			else {
				if (image.upvotes > 0){
					votestr += image.upvotes+' upvote';
					if (image.upvotes > 1) votestr += 's';
					if (image.downvotes > 0){
						votestr += ' and '+image.downvotes+' downvote';
						if (image.downvotes > 1) votestr += 's';
					}
				}
				else if (image.downvotes > 0) votestr += image.downvotes+' downvote'+(image.downvotes>1?'s':'');
			}
			
			$data.append(
				`<p>
					<span class="uploadtime visible">uploaded <time datetime="${image.created_at}"></time> by ${image.uploader}</span>
					<span class="votes">${votestr}</span>
					<span class="comments">${cc>0?cc:'no'} comment${cc!==1?'s':''}</span>
					<span class="faves">${fc>0?fc:'no'} favorite${fc!==1?'s':''}</span>
				</p>`
			);
			window.updateMetadataSettings();

			const timeTags = () => {
				$('time').each(function(){
					const $el = $(this);

					$el.html(moment($el.attr('datetime')).fromNow());
				});
			};
			timeTags();
			setInterval(timeTags, 10000);

			setBackgroundStyles(cachedurl);
			fadeIt();
			fadeOutData();
		}
		
		let movetimeout = false,
			hideFunction = function(){
				if (!$fadeLayer.children('.hover').length)
					$fadeLayer.css('opacity', 0);
				else movetimeout = setTimeout(hideFunction, 2000);
			};
		function fadeIt(){
			$image.css('opacity', 1);

			$body.on('mousemove',$.throttle(100,function(){
				if (document.getElementById('dialog'))
					return true;
				$fadeLayer.css('opacity','1');
				$fadeLayer.on('mouseenter','> *',function(){
					$(this).addClass('hover');
				}).on('mouseleave','> *',function(){
					$(this).removeClass('hover');
				});
				fadeOutData();
			}));
			$body.triggerHandler('mousemove');
			$showSettingsButton.attr('disabled', false).on('click',function(e){
				e.preventDefault();

				$settingsWrap.toggleClass('open');
				$body.triggerHandler('mousemove');
			});
		}
		
		function fadeOutData(){
			if (movetimeout !== false){
				clearTimeout(movetimeout);
				//noinspection JSUnusedAssignment
				movetimeout = false;
			}
			if (!$settingsWrap.hasClass('open'))
				movetimeout = setTimeout(hideFunction, 2000);
		}
	}

	function unbindHandlers(){
		$body.off('mousemove');
		$showSettingsButton.off('click').attr('disabled', true);
		$settingsWrap.removeClass('open');
	}
	
	function getCachedIMGURL(){
		return localStorage.getItem("image_data");
	}

	// First run dialog
	if (!localStorage.getItem('firstrun')){
		$(document.createElement('div'))
			.attr('id','dialog')
			.html('<div id="dialog-inner"><h1>Welcome to Derpi-New Tab</h1><p>To access the settings click the <i class="material-icons">menu</i> icon in the bottom left of the browser window.<br><span style="color:rgba(255,255,255,.5)">(this message is only displayed once)</span></p></div>')
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

    $cropSettings.find('select').material_select();
})(jQuery);
