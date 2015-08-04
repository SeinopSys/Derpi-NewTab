$(function(){
	var newline = '\n';
	
	//Setting check
	var settings = {
		allowedTags: [],
		metadata: {},
	};
	//	Tag settings
	(function TagSettings(){
		var possibleTags = ['safe','suggestive','questionable','explicit'],
			tagselectTimeout, tagselectCountdownInterval;
		if (LStorage.has('setting_allowed_tags')){
			var setTags = LStorage.get('setting_allowed_tags').split(',');
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
		$.each(possibleTags,function(i,el){
			$('#settings .systags').append(
				'<label>\
					<input type="checkbox" name="'+el+'"'+(settings.allowedTags.indexOf(el) > -1 ? ' checked':'')+'>\
					<span>'+el+'</span>\
				</label>'
			);
		});
		$('#settings .systags label span').on('click',function(e){
			e.preventDefault();
			
			if (typeof tagselectTimeout === 'number'){
				clearInterval(tagselectTimeout);
				tagselectTimeout = [][0];
			}
			if (typeof tagselectCountdownInterval === "number"){
				clearInterval(tagselectCountdownInterval);
				tagselectCountdownInterval = [][0];
			}
			
			var $tagSettings = $('#tag-settings'),
				i = 6,
				tagSelectCountdown = function(){
					if (--i === 0) return clearInterval(tagselectCountdownInterval);
					
					var $elem = $('#tag-settings .re-request span').text(i+' second'+(i !== 1 ? 's':'')).parent();
					if (!$elem.is(':visible')) $elem.stop().hide().slideDown();
				},
				$this = $(this),
				$thisInput = $this.prev(),
				tagArray = [];
			
			$thisInput.prop('checked',!$thisInput.prop('checked'));
			
			tagselectCountdownInterval = setInterval(tagSelectCountdown,1000);
			tagSelectCountdown();
			tagselectTimeout = setTimeout(function(){
				$this.parent().parent().children().each(function(i,el){
					var $input = $(el).find('input'),
						tag = $input.attr('name');
					if ($input.prop('checked'))
						tagArray.push(tag);
				});
				
				if (tagArray.length > 0){
					settings.allowedTags = tagArray;
					LStorage.set('setting_allowed_tags',tagArray.join(','));
					
					$('#image').css('opacity','0');
					$('#settingsWrap').removeClass('open');
					$('body').off('mousemove');
					
					setTimeout(reQuest,300);
				}
			}, 5000);
		});
	})();
	// Metadata settings
	(function MatadataSettings(){
		var $inputs = $('#metadata-settings .input.showhide input'), keys;
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
			
			$('#data p span').filter(':visible').addClass('visible').last().removeClass('visible');
		}
		window.updateMetadataSettings = function(){ updateMetadataSettings() };
		
		updateMetadataSettings();
		
		$inputs.each(function(){
			this.checked = !!settings.metadata[this.name];
			$(this).prop('checked',this.checked);
		});
		$('#metadata-settings .input.showhide label input').on('click',function(e){
			e.stopPropagation();
			
			var input = this,
				isChecked = !$(input).is(':checked'),
				nameAttr = input.name,
				attrIndx = keys.indexOf(nameAttr);
			
			if (attrIndx == -1) keys.push(nameAttr);
			else keys.splice(attrIndx,1);
			
			updateMetadataSettings();
		});
	})();
	
	setTimeout(function(){
		// Begin site
		if (LStorage.has("image_data") && LStorage.has("image_hash")){
			$('#style').html(newline+
				'#image {'+newline+
				'	background-image: url('+LStorage.get("image_data")+');'+newline+
				'}'
			);
			$('#image').css('opacity','1').attr('data-hash',LStorage.get('image_hash'));
		}
		
		reQuest();
	},500);
	
	$('#data').html('<h1>Requesting metadata...</h1>').css('opacity',1);
	function reQuest(page){
		$('#tag-settings .re-request').slideUp();
		
		$.ajax({
			url: 'https://derpibooru.org/search.json?q=wallpaper+%26%26+('+settings.allowedTags.join('+%7C%7C+')+')+%26%26+-equestria+girls'+(typeof page === 'number' ? '&page='+page : ''),
			success: function(data){
				var image, imgElement = new Image(), i = -1;
				
				data = data.search;
				
				if (data.length === 0) return $('#data').html('<h1>Search returned no results.</h1>'+(settings.allowedTags.indexOf('safe') == -1 ? '<p>Try enabling the safe system tag.</p>':'')), fadeIt();
				
				while (++i < data.length-1){
					if (data[i].width >= 1280 && data[i].height >= 720){
						image = data[i];
						break;
					}
				}
				
				if (typeof image === 'undefined') return reQuest(typeof page === 'number' ? page+1 : 2);
				
				if (!LStorage.has("image_hash") || LStorage.get("image_hash") !== image.sha512_hash){
					if (typeof page === 'undefined') $('#data').html('<h1>Downloading newest image...</h1>').css('opacity','1');
					
					imgElement.src = 'http://'+image.image;
					$(imgElement).load(function(){
						var imgCanvas = document.createElement("canvas"),
							imgContext = imgCanvas.getContext("2d");
						
						// Make sure canvas is as big as the picture
						imgCanvas.width = image.width;
						imgCanvas.height = image.height;
						
						// Draw image into canvas element
						imgContext.drawImage(imgElement, 0, 0, image.width, image.height);
						
						// Get canvas contents as a data URL
						try {
							var imgAsDataURL = imgCanvas.toDataURL("image/png");
						}
						catch (e){
							var a = document.createElement('a');
							a.href = imgElement.src;
							$('#data').html('<h1>Cross domain download issues</h1><p>Please whitelist the domain <b>'+a.hostname+'</b> in manifest.json</p>');
							return;
						}
						imgAsDataURL = thumbnail(imgAsDataURL, 1280, 720);
						
						// Save image into localStorage
						LStorage.set("image_data", imgAsDataURL);
						LStorage.set("image_hash", image.sha512_hash);
						
						metadata(image, imgAsDataURL);
					}).error(function(){
						$('#data').html('<h1>Image has not been rendered yet</h1><p>Try reloading a minute or so</p>');
						fadeIt();
						return reQuest(typeof page === 'number' ? page+1 : 2)
					});
				}
				else {
					metadata(image, getCachedIMGURL());
				}
			}
		});
		
		function metadata(image,cachedurl){
			var tags = image.tags.split(', '),
				artists = [];
			
			$.each(tags,function(i,el){
				if (el.indexOf('artist:') === 0)
					artists.push(el.substring(7));
			});
			
			var artistText = artists.length ? 'Created by '+textify(artists) : 'Unknown artist';
			
			$('#data').empty().append('<h1><a href="https://derpibooru.org/'+image.id_number+'">'+artistText+'</a></h1>');
			
			var votestr = '', cc = image.comment_count;
			if (image.upvotes + image.downvotes == 0) votestr = 'no votes';
			else {
				if (image.upvotes > 0){
					var pluralVote = true;
					votestr += image.upvotes+' upvote';
					if (image.upvotes > 1) votestr += 's';
					if (image.downvotes > 0){
						votestr += ' and '+image.downvotes+' downvote';
						if (image.downvotes > 1) votestr += 's';
					}
				}
				else if (image.downvotes > 0) votestr += image.downvotes+' downvote'+(image.downvotes>1?'s':'');
			}
			
			$('#data').append(
				'<p>\
					<span class="uploadtime visible">uploaded <time datetime="'+image.created_at+'"></time> by '+image.uploader+'</span>\
					<span class="votes">'+votestr+'</span>\
					<span class="comments">'+(cc>0?cc:'no')+' comment'+(cc>1||cc==0?'s':'')+'</span>\
				</p>'
			);
			updateMetadataSettings();
			window.updateTimesF();
			
			if ($('#style').html().length > 0){
				$('#style').html(newline+
					'#image {'+newline+
					'	background-image: url('+cachedurl+');'+newline+
					'	background-size: cover;'+newline+
					'}'
				);
			}
			fadeIt();
		}
		
		var movetimeout = false, sidebarTimeout = false, latestX;
		function fadeIt(){
			$('#image').css('opacity','1');
			
			$('body').on('mousemove',function(e){
				$('#data').css('opacity','1');
				fadeOutData();
				latestX = e.clientX;
				if (sidebarTimeout == false && $('#settingsWrap').hasClass('open')){
					if (!$('#settings').is(':hover'))
						setTimeout(function(){
							if (!$('#settings').is(':hover'))
								$('#settingsWrap').removeClass('open');
						},400);
				}
				else if (latestX <= 5)
					if (sidebarTimeout == false)
						sidebarTimeout = setTimeout(function(){
							if (latestX > 5){
								clearTimeout(sidebarTimeout);
								sidebarTimeout = false;
							}
							
							$('#settingsWrap').addClass('open');
							
							setTimeout(function(){
								clearTimeout(sidebarTimeout);
								sidebarTimeout = false;
							},500);
						},200);
			}).trigger('mousemove').blur(function(){
				$('#settingsWrap.open').removeClass('open');
			});
		}
		
		function fadeOutData(){
			var hideFunction = function(){
				if (!$('#data').is(':hover'))
					$('#data').css('opacity','0');
				else movetimeout = setTimeout(hideFunction, 4000);
			};
			if (movetimeout !== false){
				clearTimeout(movetimeout);
				movetimeout = false;
			}
			movetimeout = setTimeout(hideFunction, 4000);
		}
	}
	
	function getCachedIMGURL(){
		return LStorage.get("image_data");
	}
		
	// List textifier
	function textify(list, append, separator){
		if (typeof append == 'undefined') append = 'and';
		if (typeof separator == 'undefined') separator = ',';
		
		if (typeof list === 'string') $list = $list.split(separator);
		if (list.length > 1){
			var list_str = list,
				list_str_len = list_str.length,
				maxDest = list_str_len-3,
				i = 0;
			list_str.splice(list_str_len-1,0,append);
			while (i <= maxDest){
				if (i == list_str_len-1) continue;
				list_str[i] += ',';
				i++;
			}
			list_str = list_str.join(' ');
		}
		else list_str = list[0];
		return list_str;
	}
});