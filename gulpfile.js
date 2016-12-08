var gulp = require('gulp');
var syncy = require('syncy');
var sass = require('gulp-sass');
var notify = require('gulp-notify');
var spsync = require('gulp-spsync-creds').sync;
var settings = require('./settings.json');
var rmdir = require('rmdir');
var rename = require("gulp-rename");
var packageName = require('root-require')('package.json').name;
var util = require('util');
var htmlreplace = require('gulp-html-replace');
var uglify = require('gulp-uglify');
var cleanCSS = require('gulp-clean-css');
var gutil = require('gulp-util');
var sourcemaps = require('gulp-sourcemaps');
var fileExists = require('file-exists');
var fs = require('fs');
var foreach = require('gulp-foreach');
var path = require('path');

gulp.task('clean:dist', (done) => {
    rmdir('./dist', function (err, dirs, files) {
        done();
    });
});

//Sync assets to public folder excluding SASS files and JS
gulp.task('sync:assets', ['clean:dist'], (done) => {
    syncy(['app/assets/**/*', '!app/assets/sass/**',  '!app/assets/javascripts/**', '!app/assets/*_subsite/javascripts/**', '!app/assets/*_subsite/sass/**', '!app/assets/*_subsite/socialBookmarks.html'], './dist/_catalogs/masterpage/public', {
            ignoreInDest: '**/stylesheets/**',
            base: 'app/assets',
            updateAndDelete: false
        }).then(() => { 
            done();
    }).catch((err) => { done(err);})
});

//Sync app/assets/javascripts to dist/_catalogs/masterpages/public/javascripts
gulp.task('sync:javascripts', ['sync:assets'], (done) => {
    return gulp.src('app/assets/javascripts/**')
        //don't uglify if gulp is ran with '--debug'
        .pipe(gutil.env.debug ? gutil.noop() : uglify())
        .pipe(gulp.dest('dist/_catalogs/masterpage/public/javascripts'));
});

//Sync lcc_frontend_toolkit to lcc_modules to be used for SASS partial compilation
gulp.task('sync:lcc_frontend_toolkit', ['sync:javascripts'], (done) => {
    syncy(['node_modules/lcc_frontend_toolkit/**'], 'lcc_modules/lcc_frontend_toolkit', {
            base: 'node_modules/lcc_frontend_toolkit',
            updateAndDelete: true
        }).then(() => { 
            done();
    }).catch((err) => { done(err);})
});

//Sync lcc_templates_sharepoint/assets excluding JS to dist/_catalogs/masterpages/public
gulp.task('sync:lcc_templates_sharepoint_assets', ['sync:lcc_frontend_toolkit'], (done) => {
    syncy(['node_modules/lcc_templates_sharepoint/assets/**/*', '!node_modules/lcc_templates_sharepoint/assets/javascripts/*', '!node_modules/lcc_templates_sharepoint/assets/stylesheets/*'], 'dist/_catalogs/masterpage/public', {
            base: 'node_modules/lcc_templates_sharepoint/assets',
            updateAndDelete: false
        }).then(() => { 
            done();
    }).catch((err) => { done(err);})
});

//Sync lcc_templates_sharepoint/assets/stylesheets to dist/_catalogs/masterpages/public/stylesheets
gulp.task('sync:lcc_templates_sharepoint_stylesheets', ['sync:lcc_templates_sharepoint_assets'], (done) => {
    return gulp.src('node_modules/lcc_templates_sharepoint/assets/stylesheets/*.css')
        //don't clean if gulp is ran with '--debug'
        .pipe(gutil.env.debug ? gutil.noop() : cleanCSS({processImport:false}))
        .pipe(gulp.dest('dist/_catalogs/masterpage/public/stylesheets'));
});

//Sync lcc_templates_sharepoint/assets/javascripts to dist/_catalogs/masterpages/public/javascripts
gulp.task('sync:lcc_templates_sharepoint_javascript', ['sync:lcc_templates_sharepoint_stylesheets'], (done) => {
    return gulp.src('node_modules/lcc_templates_sharepoint/assets/javascripts/**')
        //don't uglify if gulp is ran with '--debug'
        .pipe(gutil.env.debug ? gutil.noop() : uglify())
        .pipe(gulp.dest('dist/_catalogs/masterpage/public/javascripts'));
});

//Sync lcc_templates_sharepoint/views to dist/_catalogs/masterpages
gulp.task('sync:lcc_templates_sharepoint_views', ['sync:lcc_templates_sharepoint_javascript'], (done) => {
    syncy(['node_modules/lcc_templates_sharepoint/views/*', '!node_modules/lcc_templates_sharepoint/views/lcc-template.master'], 'dist/_catalogs/masterpage', {
            base: 'node_modules/lcc_templates_sharepoint/views',
            updateAndDelete: false
        }).then(() => { 
            done();
    }).catch((err) => { done(err);})
});

var replacements = {};

replacements.css =  util.format('/_catalogs/masterpage/public/stylesheets/%s.css', packageName.replace(/_/g, '-'));
if(fileExists('./socialBookmarks.html')) {
    replacements.socialBookmarks = fs.readFileSync('socialBookmarks.html').toString()
}

//Update app css ref and rename master
gulp.task('sync:lcc_templates_sharepoint_master', ['sync:lcc_templates_sharepoint_views'], (done) => {
    return gulp.src("node_modules/lcc_templates_sharepoint/views/lcc-template.master")
    .pipe(htmlreplace(replacements, {keepUnassigned:true}))
    .pipe(rename(util.format("%s.master", packageName))).pipe(gulp.dest("./dist/_catalogs/masterpage"));
});

//Compile SASS into the application CSS and copy to public folder
gulp.task('sass', ['sync:lcc_templates_sharepoint_master'], (done) => {
    return gulp.src('app/assets/sass/application.scss')
      .pipe(gutil.env.debug ? sourcemaps.init() : gutil.noop())
      .pipe(sass({includePaths: ['./app/assets/sass',
            'lcc_modules/lcc_frontend_toolkit/stylesheets/']}).on('error', function (err) {
          notify({ title: 'SASS Task' }).write(err.line + ': ' + err.message);
      }))
      .pipe(gutil.env.debug ? sourcemaps.write() : gutil.noop())
      //don't clean if gulp is ran with '--debug'
      .pipe(gutil.env.debug ? gutil.noop() : cleanCSS({ processImport: false }))
      .pipe(rename(util.format("%s.css", packageName.replace(/_/g, '-'))))
      .pipe(gulp.dest('./dist/_catalogs/masterpage/public/stylesheets'))
});

//Compile subsite sass/js and masterpages
gulp.task('sass:subsites', ['sass'], (done) => {
    return gulp.src(['app/assets/*_subsite/sass/*.scss'])
    .pipe(foreach(function(stream, file) {          
        var subsite = (path.normalize(util.format('%s%s..', path.dirname(file.path), path.sep)).split(path.sep).pop());
        return stream.pipe(sass({includePaths: ['./app/assets/sass' + subsite,
            'lcc_modules/lcc_frontend_toolkit/stylesheets/']}).on('error', function (err) {
            notify({ title: 'SASS Task' }).write(err.line + ': ' + err.message);
            this.emit('end');
        }))
        .pipe(gutil.env.debug ? sourcemaps.write() : gutil.noop())
        //don't clean if gulp is ran with '--debug'
        .pipe(gutil.env.debug ? gutil.noop() : cleanCSS({ processImport: false }))
        .pipe(rename(function(path) {
            path.dirname = "";
            return path;
        }))
        .pipe(gulp.dest(util.format('./dist/_catalogs/masterpage/public/%s/stylesheets', subsite)));     
    }));
});

//Add subsite masterpages
gulp.task('sync:subsites_master', ['sass:subsites'], (done) => {
    return gulp.src('app/assets/*_subsite/', ['!app/assets/*_subsite/**/*.*'])
        .pipe(foreach(function(stream, folder) {  
            var subsiteName = folder.path.split(path.sep).pop();
            var replacements = {};
            replacements.css =  util.format('/_catalogs/masterpage/public/%s/stylesheets/application.css', subsiteName);

            if(fileExists(folder.path + '/socialBookmarks.html')) {
                replacements.socialBookmarks = fs.readFileSync(folder.path + '/socialBookmarks.html').toString()
            } else if(fileExists('./socialBookmarks.html')) {
                 replacements.socialBookmarks = fs.readFileSync('socialBookmarks.html').toString()
            }

            return gulp.src("node_modules/lcc_templates_sharepoint/views/lcc-template.master")
 	            .pipe(htmlreplace(replacements, {keepUnassigned:true}))
                .pipe(rename(util.format("lcc_%s.master", subsiteName))).pipe(gulp.dest("./dist/_catalogs/masterpage"));
        }));
});

gulp.task('sp-upload', ['sync:subsites_master'], (done) => {
    var glob = gutil.env.css ? 'dist/**/*.css' :'dist/**/*.*';
    return gulp.src(glob)
    .pipe(spsync({
        "username": settings.username,
        "password": settings.password,
        "site": settings.siteUrl,
        "publish": true,
        "verbose": false,
        "update_metadata":true,
        "files_metadata": [
            {
                "name": "layout_multi_sections_home.aspx",              
                "metadata": {
                    "__metadata": {
                        "type": "SP.Data.OData__x005f_catalogs_x002f_masterpageItem"
                    },
                    "Title": "Multi Section Home Layout (LCC)"
                }
            },
            {
                "name": "layout_multi_sections.aspx",
                "metadata": {
                    "__metadata": {
                        "type": "SP.Data.OData__x005f_catalogs_x002f_masterpageItem"
                    },
                    "Title": "Multi Section Layout (LCC)"
                }
            }
        ]
    })
    );
});

gulp.task('default',  ['clean:dist', 'sync:assets', 'sync:javascripts', 'sync:lcc_frontend_toolkit', 'sync:lcc_templates_sharepoint_assets', 'sync:lcc_templates_sharepoint_stylesheets', 'sync:lcc_templates_sharepoint_javascript', 'sync:lcc_templates_sharepoint_views', 'sync:lcc_templates_sharepoint_master', 'sass', 'sass:subsites', 'sync:subsites_master']);
gulp.task('upload',  ['default', 'sp-upload']);
