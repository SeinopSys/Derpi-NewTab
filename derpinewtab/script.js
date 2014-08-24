$(function(){
	var newline = '\n', space = ' &bull; ';
	
	//Setting check
	var settings = {
		allowedTags: [],
	};
	//	Tag settings
	var possibleTags = ['safe','suggestive','explicit'];
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
		
		var $this = $(this),
			$thisInput = $this.prev(),
			tagArray = [];
		
		$thisInput.prop('checked',!$thisInput.prop('checked'));
		
		$this.parent().parent().children().each(function(i,el){
			var $input = $(el).find('input'),
				tag = $input.attr('name');
			console.log('checking tag '+tag);
			if ($input.prop('checked')){
				console.log('pass '+tag);
				tagArray.push(tag);
			}
		});
		
		if (tagArray.length > 0){
			settings.allowedTags = tagArray;
			LStorage.set('setting_allowed_tags',tagArray.join(','));
			
			$('#image').css('opacity','0');
			$('#settings').removeClass('open');
			$('body').off('mousemove');
			$('#data').css('opacity','0');
			
			setTimeout(reQuest,300);
		}
	});
	
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
	
	function reQuest(){
		$.ajax({
			url: 'https://derpibooru.org/search.json?q=wallpaper+%26%26+('+settings.allowedTags.join('+%7C%7C+')+')',
			success: function(data){
				var image = data.search[0],
					imgElement = new Image();
				
				if (!LStorage.has("image_hash") || LStorage.get("image_hash") !== image.sha512_hash){
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
						var imgAsDataURL = imgCanvas.toDataURL("image/png");
						imgAsDataURL = thumbnail(imgAsDataURL, 1280, 720);
						
						// Save image into localStorage
						LStorage.set("image_data", imgAsDataURL);
						LStorage.set("image_hash", image.sha512_hash);
						
						metadata(image, imgAsDataURL);
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
			
			$('#data').empty().append('<h1><a href="https://derpibooru.org/'+image.id_number+'">Created by '+textify(artists)+'</a></h1>');
			
			var votestr;
			if (image.upvotes + image.downvotes == 0) votestr = 'no votes';
			else {
				if (image.upvotes > 0){
					votestr = image.upvotes+' up';
					if (image.downvotes > 0) votestr += ' and '+image.downvotes+' down';
					votestr += 'votes';
				}
				else if (image.downvotes > 0) votestr += image.downvotes+' downvotes';
			}
			
			$('#data').append(
				'<p>uploaded <time datetime="'+image.created_at+'"></time> by '+image.uploader+space+votestr+space+
				(image.comment_count>0?image.comment_count:'no')+' comments</p>'
			);
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
				if (sidebarTimeout == false && $('#settings').hasClass('open')){
					if (!$('#settings').is(':hover'))
						setTimeout(function(){
							if (!$('#settings').is(':hover'))
								$('#settings').removeClass('open');
						},400);
				}
				else if (latestX <= 5)
					if (sidebarTimeout == false)
						sidebarTimeout = setTimeout(function(){
							if (latestX > 5){
								clearTimeout(sidebarTimeout);
								sidebarTimeout = false;
							}
							
							console.log('Open sidebar');
							
							$('#settings').addClass('open');
							
							setTimeout(function(){
								clearTimeout(sidebarTimeout);
								sidebarTimeout = false;
							},500);
						},200);
			}).trigger('mousemove').blur(function(){
				$('#settings.open').removeClass('open');
			});
		}
		
		function fadeOutData(){
			var hideFunction = function(){
				if (!$('#data').is(':hover'))
					$('#data').css('opacity','0');
				else movetimeout = setTimeout(hideFunction, 2000);
			};
			if (movetimeout !== false){
				clearTimeout(movetimeout);
				movetimeout = false;
			}
			movetimeout = setTimeout(hideFunction, 2000);
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
			while (i < maxDest){
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