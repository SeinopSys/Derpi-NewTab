(function($){
	'use strict';
	var timePad = function(i){if(!isNaN(i)){i=parseInt(i);if (i<10&&i>=0)i='0'+i;else if(i<0)i='-0'+Math.abs(i);else i=i.toString()}return i};
	var months = [
		"January", 
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	];
	var weekdays = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	var dateformat = {
		order: '{{wd}}, {{d}} {{mo}}, {{y}}. {{h}}:{{mi}}',
		day: function(date){
			var ret = date, rem = date % 10;
			if (date !== 11 && rem === 1) ret += 'st';
			else if (date !== 12 && rem === 2) ret += 'nd';
			else if (date !== 13 && rem === 3) ret += 'rd';
			else ret += 'th';
			return ret;
		},
		weekday: function(wd){ return weekdays[parseInt(wd)] },
		month: function(m){ return months[parseInt(m)-1] },
		year: function(y){ return y },
	};
	var snLnObj = {
		s:'second',
		mi:'minute',
		h:'hour',
		d:'day',
		w:'week',
		mo:'month',
		y:'year',
	};
	var timeparts = function(key, num){
		if (typeof snLnObj[key] !== 'undefined')
			return num+' '+snLnObj[key]+(num > 1 ? 's' : '');
	};
	var update = function(){
		$('time').each(function(){
			var date = $(this).attr('datetime');
			if (typeof date !== 'string') return true;
			var postdate = new Date(date);
			
			if (isNaN(postdate.getTime())) return true;
			
			date = {
				d: dateformat.day(postdate.getDate()),
				y: dateformat.year(postdate.getFullYear()),
				mo: dateformat.month(postdate.getMonth()+1),
				wd: dateformat.weekday(postdate.getDay()),
				h: timePad(postdate.getHours()),
				mi: timePad(postdate.getMinutes()),
				order: dateformat.order,
			};
			var keys = Object.keys(date);
			keys.splice(keys.indexOf('order'),1);
			
			for (var i=0,l=keys.length; i<l; i++) date.order = date.order.replace(new RegExp('\{\{'+keys[i]+'\}\}'),date[keys[i]]);
			
			$(this).attr( 'title', date.order );

			var now = new Date();
			var timestr = createTimeStr(timeDifference(now,postdate));
			
			$(this).html(timestr);
		});
	};
	/**
		Time differenec function (modified)
		source: http://psoug.org/snippet/Javascript-Calculate-time-difference-between-two-dates_116.htm
		
		I did not create this function entirely by myself, and I'm taking no credit for the parts I didn't write.
	**/
	function timeDifference(now,earlierdate) {
		var difference = {
			time: now.getTime() - earlierdate.getTime()
		};
		
		difference.day = Math.floor(difference.time/1000/60/60/24);
		difference.time -= difference.day*1000*60*60*24;
		
		difference.hour = Math.floor(difference.time/1000/60/60);
		difference.time -= difference.hour*1000*60*60;
		
		difference.minute = Math.floor(difference.time/1000/60);
		difference.time -= difference.minute*1000*60;
		
		difference.second = Math.floor(difference.time/1000);
		
		if (difference.day >= 7){
			difference.week = parseInt(difference.day/7);
			difference.day -= difference.week*7;
		}
		if (difference.week >= 4){
			difference.month = parseInt(difference.week/4);
			difference.week -= difference.month*4;
		}
		if (difference.month >= 12){
			difference.year = parseInt(difference.month/12);
			difference.month -= difference.year*12;
		}
		
		return difference;
	}
	function createTimeStr(obj){
		if (typeof obj !== 'object' || $.isArray(obj)) return false;
		if (obj.time > 0) delete obj.time;
		
		var keys = Object.keys(obj), returnStr = '';
		for (var i=0,l=keys.length; i<l; i++) if (keys[i] !== 'second' && obj[keys[i]] < 1) delete obj[keys[i]];
		
		if (obj.year > 0) returnStr = timeparts('y',obj.year);
		else if (obj.month > 0) returnStr = timeparts('mo',obj.month);
		else if (obj.week > 0) returnStr = timeparts('w',obj.week);
		else if (obj.day > 0) returnStr = timeparts('d',obj.day);
		else if (obj.hour > 0) returnStr = timeparts('h',obj.hour);
		else if (obj.minute > 0) returnStr = timeparts('mi',obj.minute);
		else if (obj.second > 0) returnStr = timeparts('s',obj.second);
		
		return (returnStr+' ago').replace(/^\sago$/,'just now');
	}
	update();
	window.updateTimesF = function(){
		update.apply(update,arguments);
	};
	if (window.noAutoUpdateTimes !== true)
		window.updateTimes = setInterval(update,10000);
})(jQuery);
