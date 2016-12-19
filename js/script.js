/* global LStorage,updateMetadataSettings */
$(function(){
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
			filterID: undefined,
		},
		everythingFilterID = 56027,
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
		$filterID = $('#filter-id'),
		$filterIDSelect = $('#filter-id-select'),
		$signinFilter = $('#signin-filter'),
		$usefilterInput = $tagSettings.find('.usefilter input'),
		$showSettingsButton = $('#show-settings-button'),
		_currentImageURL;

	$.get('https://derpibooru.org/filters',function(data){
		let $data = $(data.replace(/src="[^"]+?"/g,'')),
			$optg = {
				your: $(document.createElement('optgroup')).attr('label','My Filters'),
				global: $(document.createElement('optgroup')).attr('label','Global Filters'),
			},
			userpage = $data.find('.header__link.header__link-user').attr('href');

		if (!userpage){
			$signinFilter.addClass('nope').attr('title','You must be signed in on Derpibooru.org to see your own filters.');
		}

		$data.find('.filter').each(function(){
			let $filter = $(this),
				name = $filter.children('h3').text(),
				id = parseInt($filter.children('.filter-options').find('a[href^="/filters/"]').attr('href').replace(/\D/g,''), 10);

			if (id === everythingFilterID)
				return;

			$optg[$filter.find('a[href="'+userpage+'"]').length ? 'your' : 'global'].append($(document.createElement('option')).attr('value',id).text(name));
		});

		if ($optg.your.children().length)
			$filterIDSelect.append($optg.your);
		$filterIDSelect.append($optg.global);
		if (settings.filterID){
			if ($filterIDSelect.find('option[value="'+settings.filterID+'"]').length)
				$filterIDSelect.val(settings.filterID);
			else $filterIDSelect.val('???');
		}
		else $filterIDSelect.val('');
	});

	// Tag settings
	(function TagSettings(){
		let possibleTags = ['safe','suggestive','questionable','explicit'],
			tagselectTimeout, tagselectCountdownInterval;
		if (LStorage.has('setting_allowed_tags')){
			let setTags = LStorage.get('setting_allowed_tags').split(',');
			$.each(setTags,function(i,el){
				if (possibleTags.indexOf(el) > -1)
					settings.allowedTags.push(el);
			});
			if (settings.allowedTags.length > 0) LStorage.set('setting_allowed_tags',settings.allowedTags.join(','));
		}
		if (settings.allowedTags.length === 0){
			LStorage.set('setting_allowed_tags','safe');
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
		function tagSelectCountdownStarter(){
			if (typeof tagselectTimeout === 'number'){
				clearInterval(tagselectTimeout);
				//noinspection JSUnusedAssignment
				tagselectTimeout = undefined;
			}
			if (typeof tagselectCountdownInterval === "number"){
				clearInterval(tagselectCountdownInterval);
				tagselectCountdownInterval = undefined;
			}

			let i = 6,
				tagSelectCountdown = function(){
					if (--i === 0) return clearInterval(tagselectCountdownInterval);

					let $elem = $tagSettings.find('.re-request span').text(i+' second'+(i !== 1 ? 's':'')).parent();
					if (!$elem.is(':visible')) $elem.stop().hide().slideDown();
				},
				tagArray = [];

			tagselectCountdownInterval = setInterval(tagSelectCountdown,1000);
			tagSelectCountdown();
			tagselectTimeout = setTimeout(function(){
				$systags.children().each(function(i,el){
					let $input = $(el).find('input'),
						tag = $input.attr('name');
					if ($input.prop('checked'))
						tagArray.push(tag);
				});

				let tagsCond = tagArray.length > 0,
					val = parseInt($filterID.val(), 10),
					filterCond = !isNaN(val);

				if (tagsCond){
					settings.allowedTags = tagArray;
					LStorage.set('setting_allowed_tags',tagArray.join(','));
				}
				if (filterCond){
					settings.filterID = val;
					LStorage.set('setting_filterid',settings.filterID);
				}
				else {
					$usefilterInput.prop('checked', false);
					settings.filterID = undefined;
					LStorage.del('setting_filterid');
				}
				if (tagsCond || filterCond){
					$image.css('opacity','0');
					$imageGhost.css('opacity','0');
					unbindHandlers();

					setTimeout(reQuest,300);
				}
			}, 5000);
		}
		$settings.find('.systags label span').on('click',function(e){
			e.preventDefault();

			let $thisInput = $(this).prev();
			$thisInput.prop('checked',!$thisInput.prop('checked'));

			tagSelectCountdownStarter();
		});

		if (LStorage.has('setting_filterid')){
			let filterid = parseInt(LStorage.get('setting_filterid'), 10);
			if (isNaN(filterid))
				LStorage.del('setting_filterid');
			else {
				settings.filterID = filterid;
				$usefilterInput.prop('checked', true);
				$filterID.val(settings.filterID).trigger('change');
			}
		}
		if (settings.allowedTags.length === 0){
			LStorage.set('setting_allowed_tags','safe');
			settings.allowedTags = ['safe'];
		}
		$usefilterInput.on('click',function(){
			let $this = $(this),
				checked = $this.prop('checked');

			if (!checked)
				$filterID.val('').trigger('change');
		});
		$filterIDSelect.on('change keyup',function(){
			let val = $filterIDSelect.val();
			if (val && /^\d+$/.test(val)){
				if ($usefilterInput.prop('checked') !== true)
					$usefilterInput.prop('checked', true);
				$filterID.val(val).trigger('change');
			}
		});
		$filterID.on('change keyup',function(){
			if ($filterIDSelect.find('option[value="'+$filterID.val()+'"]').length)
				$filterIDSelect.val($filterID.val());
			else $filterIDSelect.val('???');
			if (!$filterID.is(':valid'))
				return;

			let currFilter = settings.filterID ? settings.filterID : '';
			if ($filterID.val() !== currFilter)
				tagSelectCountdownStarter();
		});
	})();
	// Metadata settings
	(function MatadataSettings(){
		let $inputs = $metaSettings.find('.switch input'), keys;
		$inputs.each(function(){
			settings.metadata[this.name] = false;
		});
		
		if (!LStorage.has('setting_metadata')){
			keys = Object.keys(settings.metadata);
			LStorage.set('setting_metadata',keys.join(','));
		}
		else {
			keys = LStorage.get('setting_metadata');
			if (keys.length === 0) keys = [];
			else keys = keys.split(',');
		}
		
		$.each(keys,function(i,el){
			if (typeof settings.metadata[el] !== 'undefined')
				settings.metadata[el] = true;
			else delete keys[i];
		});
		
		function updateMetadataSettings(noupdatekeys){
			if (noupdatekeys !== true) LStorage.set('setting_metadata',keys.join(','));
			
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

		if (!LStorage.has('setting_crop')){
			settings.crop = 'contain';
			LStorage.set('setting_crop', settings.crop);
		}
		else settings.crop = LStorage.get('setting_crop');

		function updateCroppingSettings(){
			let setTo = settings.crop;
			if (['contain','cover','100% 100%'].indexOf(setTo) === -1)
				setTo = 'cover';

			LStorage.set('setting_crop', setTo);
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
	if (LStorage.has("image_data") && LStorage.has("image_hash")){
		setBackgroundStyles(LStorage.get("image_data"));
		$image.css('opacity','1').attr('data-hash',LStorage.get('image_hash'));
	}

	reQuest();

	$data.html('<h1>Requesting metadata...</h1>').css('opacity', 1);
	function reQuest(page){
		$body.removeClass('notloading');
		$tagSettings.find('.re-request:visible').slideUp();
		
		$.ajax({
			url: 'https://trixiebooru.org/search.json'+
			        '?filter_id='+(settings.filterID||everythingFilterID)+
			        '&q=wallpaper+%26%26+('+settings.allowedTags.join('+%7C%7C+')+')+%26%26+-equestria+girls'+
			        (typeof page === 'number' ? '&page='+page : ''),
			success: function(data){
				let image, imgElement = new Image(), i = -1;
				
				data = data.search;
				
				if (data.length === 0) {
					fadeIt();
					$body.addClass('notloading');
					$data.html('<h1>Search returned no results.</h1>' + (settings.allowedTags.indexOf('safe') === -1 ? '<p>Try enabling the safe system tag.</p>' : ''));
					return;
				}
				
				while (++i < data.length-1){
					// Optimal size images are above 720p and below 4096px in width & height, since larger images will make the browser lag
					if (data[i].width >= 1280 && data[i].height >= 720 && data[i].width <= 4096 && data[i].height <= 4096){
						image = data[i];
						break;
					}
				}
				$body.addClass('notloading');
				
				if (typeof image === 'undefined')
					return reQuest(typeof page === 'number' ? page+1 : 2);
				
				if (!LStorage.has("image_hash") || LStorage.get("image_hash") !== image.sha512_hash){
					if (typeof page === 'undefined')
						$data.html('<h1>Searching for new image...</h1>').css('opacity','1');
					
					imgElement.src = 'http://'+image.image;
					$(imgElement).on('load',function(){
						// Save image into localStorage
						LStorage.set("image_data", imgElement.src);
						LStorage.set("image_hash", image.sha512_hash);
						
						metadata(image, imgElement.src);
					}).on('error', function(){
						$data.html('<h1>Image has not been rendered yet</h1><p>Try reloading in a minute or so</p>');
						fadeIt();
						return reQuest(typeof page === 'number' ? page+1 : 2);
					});
				}
				else metadata(image, getCachedIMGURL());
			},
			error: function(){
				$body.addClass('notloading');
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
			
			let artistText = artists.length ? 'By '+textify(artists) : 'Artist unknown';
			
			$data.empty().append('<h1><a href="https://derpibooru.org/'+image.id+'">'+artistText+'</a></h1>');

			$data.children('h1').simplemarquee({
			    speed: 25,
			    cycles: Infinity,
			    space: 25,
			    handleHover: false,
			    delayBetweenCycles: 0,
			});
			
			let votestr = '', cc = image.comment_count;
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
				</p>`
			);
			updateMetadataSettings();
			window.updateTimesF();

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
		return LStorage.get("image_data");
	}

	// First run dialog
	if (!LStorage.has('firstrun')){
		$(document.createElement('div'))
			.attr('id','dialog')
			.html('<div id="dialog-inner"><h1>Welcome to Derpi-New Tab</h1><p>To access the settings click the <i class="material-icons">menu</i> icon in the bottom left of the browser window.<br><span style="color:rgba(255,255,255,.5)">(this message is only displayed once)</span></p></div>')
			.children()
			.append($(document.createElement('button')).text('Got it').on('click',function(e){
				e.preventDefault();

				LStorage.set('firstrun',1);
				let $dialog = $('#dialog').addClass('gtfo');
				setTimeout(function(){
					$dialog.remove();
				}, 550);
			}))
			.end()
			.prependTo($body);
	}

    $cropSettings.find('select').material_select();
		
	// List textifier
	function textify(list, append, separator){
		if (typeof append === 'undefined') append = 'and';
		if (typeof separator === 'undefined') separator = ',';

		let list_str;
		
		if (typeof list === 'string') list = list.split(separator);
		if (list.length > 1){
			list_str = list;
			let list_str_len = list_str.length,
				maxDest = list_str_len-3,
				i = 0;
			list_str.splice(list_str_len-1,0,append);
			while (i <= maxDest){
				if (i === list_str_len-1)
					continue;
				list_str[i] += ',';
				i++;
			}
			list_str = list_str.join(' ');
		}
		else list_str = list[0];
		return list_str;
	}
});
