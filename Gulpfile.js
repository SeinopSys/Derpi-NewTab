// jshint ignore: start
var cl = console.log,
	stripAnsi = require('strip-ansi'),
	chalk = require('chalk');
console.log = console.writeLine = function () {
	var args = [].slice.call(arguments);
	if (args.length){
		if (/^(\[\d{2}:\d{2}:\d{2}]|Using|Finished)/.test(args[0]))
			return;
		else if (args[0] == 'Starting'){
			args = ['[' + chalk.green('gulp') + '] ' + stripAnsi(args[1]).replace(/^'(.*)'.*$/,'$1') + ': ' + chalk.magenta('start')];
		}
	}
	return cl.apply(console, args);
};
var stdoutw = process.stdout.write;
process.stdout.write = console.write = function(str){
	var out = [].slice.call(arguments).join(' ');
	if (/\[.*?\d{2}.*?:.*?]/.test(out))
		return;
	stdoutw.call(process.stdout, out);
};

var toRun = process.argv.slice(2).slice(-1)[0] || 'default'; // Works only if task name is the last param
console.writeLine('Starting Gulp task "'+toRun+'"');
var require_list = ['gulp'];
if (['js','scss','default'].indexOf(toRun) !== -1){
	require_list.push.apply(require_list, [
		'gulp-plumber',
		'gulp-duration',
		'gulp-sourcemaps',
	]);

	if (toRun === 'scss' || toRun === 'default')
		require_list.push.apply(require_list, [
			'gulp-sass',
			'gulp-autoprefixer',
			'gulp-clean-css',
		]);
	if (toRun === 'js' || toRun === 'default')
		require_list.push.apply(require_list, [
			'gulp-uglify',
			'gulp-babel',
			'gulp-cached'
		]);
}
console.write('(');
for (var i= 0,l=require_list.length; i<l; i++){
	var v = require_list[i],
		key = v.replace(/^gulp-([a-z-]+)$/, '$1').replace(/-(\w)/,function(_, a){
			return a.toUpperCase();
		});
	global[key] = require(v);
	console.write(' '+v);
}
console.writeLine(" )\n");

var workingDir = __dirname;

function Logger(prompt){
	var $p = '['+chalk.blue(prompt)+'] ';
	this.log = function(message){
		console.writeLine($p+message);
	};
	this.error = function(message){
		if (typeof message === 'string'){
			message = message.trim()
				.replace(/[\/\\]?www/,'');
			console.error($p+'Error in '+message);
		}
		else console.log(JSON.stringify(message,null,'4'));
	};
	return this;
}

var SASSL = new Logger('scss');
gulp.task('scss', function() {
	gulp.src('sass/*.scss')
		.pipe(plumber(function(err){
			SASSL.error(err.relativePath+'\n'+' line '+err.line+': '+err.messageOriginal);
			this.emit('end');
		}))
		.pipe(sourcemaps.init())
			.pipe(sass({
				outputStyle: 'expanded',
				errLogToConsole: true,
			}))
			.pipe(autoprefixer('last 2 version'))
			.pipe(cleanCss({
				processImport: false,
				compatibility: '-units.pc,-units.pt'
			}))
		.pipe(sourcemaps.write('.', {
			includeContent: true,
		}))
		.pipe(duration('scss'))
		.pipe(gulp.dest('derpinewtab/css'));
});

var JSL = new Logger('js'),
	JSWatchArray = ['js/*.js'];
gulp.task('js', function(){
	var taskName = 'js';
	gulp.src(JSWatchArray)
		.pipe(duration(taskName))
		.pipe(cached(taskName, { optimizeMemory: true }))
		.pipe(plumber(function(err){
			err =
				err.fileName
				? err.fileName.replace(workingDir,'')+'\n  line '+(
					err._babel === true
					? err.loc.line
					: err.lineNumber
				)+': '+err.message.replace(/^[\/\\]/,'')
				                  .replace(err.fileName.replace(/\\/g,'/')+': ','')
				                  .replace(/\(\d+(:\d+)?\)$/, '')
				: err;
			JSL.error(err);
			this.emit('end');
		}))
		.pipe(sourcemaps.init())
			.pipe(babel({
				presets: ['es2015']
			}))
			.pipe(uglify({
				preserveComments: function(_, comment){ return /^!/m.test(comment.value) },
				output: { ascii_only: false },
			}))
		.pipe(sourcemaps.write('.', {
			includeContent: true,
		}))
		.pipe(gulp.dest('derpinewtab/js'));
});

gulp.task('default', ['scss', 'js'], function(){
	gulp.watch(JSWatchArray, {debounceDelay: 2000}, ['js']);
	JSL.log('File watcher active');
	gulp.watch('sass/*.scss', {debounceDelay: 2000}, ['scss']);
	SASSL.log('File watcher active');
});
