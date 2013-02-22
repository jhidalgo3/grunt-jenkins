var q = require('q'),
    _ = require('underscore'),
    request = require('request'),
  http = require('http'),
  urlUtil = require ('url'),
  fs = require ('fs'),
  sys = require ('sys'),
  https = require("https");

function JenkinsServer(serverUrl, fileSystem, grunt, auth) {
  this.fetchJobs = function() {
    var deferred = q.defer();
      var options = {
          url: [serverUrl, 'api', 'json'].join('/'),
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Basic ' + auth
          }
      };

    request(options, function(e, r, body) {
      if(e) { return deferred.reject(e); }
      var jobs = JSON.parse(body).jobs;
      grunt.log.writeln(['Found', jobs.length, 'jobs.'].join(' '));
      deferred.resolve(_.map(jobs, function(j) { return { name: j.name, url: j.url }; }));
    });

    return deferred.promise;
  };

  this.createOrUpdateJobs = function(directories) {
    var deferred = q.defer();

    function resolve (val) {
      deferred.resolve(val);
    }

    directories.forEach(function(folder) {
      fetchJobConfigurationStrategy(folder).
        then(applyStrategy).
        then(resolve);
    });

    return deferred.promise;
  };

  this.installPlugins = function(plugins) {
  grunt.log.writeln (plugins.xml);

    var deferred = q.defer();
    var options = {
          url: [serverUrl, 'pluginManager', 'installNecessaryPlugins'].join('/'),
          method: 'POST',
          body: plugins.xml,
          headers: {
              'Content-Type': 'application/xml',
              'Authorization': 'Basic ' + auth
          }
        };
             grunt.log.ok()  ;

    request(options, function(e, r, b) {
      if(e) { return deferred.reject(e); }
      _.each(plugins.plugins, function(p) {
        grunt.log.ok('install: ' + p.shortName + ' @ ' + p.version);
      });
      deferred.resolve(r.statusCode === 200);
    });

    return deferred.promise;
  };

  this.fetchEnabledPlugins = function() {
    //var url = ;
    var deferred = q.defer();
    var url = [serverUrl, 'pluginManager', 'api', 'json?depth=1'].join('/');
    var options = {
      url: url ,
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + auth
      }
    };
    console.log (url)

    request(options, function(e, r, body) {
      var result = _.filter(JSON.parse(body).plugins, function(p) { return p.enabled; });
      var plugins = _.map(result, function(p) { return { shortName: p.shortName, version: p.version }; });

      deferred.resolve(plugins);
    });

    return deferred.promise;
  };

  this.fetchJobConfigurations = function(jobs) {
    var deferred = q.defer();
    var promises = _.map(jobs, function(j) {
      var d = q.defer();
      request([j.url, 'config.xml'].join(''), function(e, r, body) {
        if(e) { return d.reject(e); }
        j.config = body;
        d.resolve(j);
      });
      return d.promise;
    });

    q.allResolved(promises).
      then(function(promises) {
        if(_.all(promises, function(p) { return p.isFulfilled(); })) {
          deferred.resolve(_.map(promises, function(p) { return p.valueOf(); }));
        } else {
          deferred.reject();
        }
      });
    return deferred.promise;
  };

  function createJob (config) {
    var deferred = q.defer();
    var options = {
      url: [serverUrl, 'createItem'].join('/'),
      method: 'POST',
      qs: {
        name: config.jobName
      },
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': 'Basic ' + auth
      },
      body: config.fileContents
    };

    var req = request(options, function(e, r, b) {

      if(e || r.statusCode !== 200) {
          return deferred.reject(e);
      }
      grunt.log.ok("create " + options.qs.name + " " + r.statusCode);
      deferred.resolve(r.statusCode === 200);
    })();


    return deferred.promise;
  }

  function updateJob (config) {
    var deferred = q.defer(),
        options = {
      url: [serverUrl, 'job', config.jobName, 'config.xml'].join('/'),
      method: 'POST',
      headers: {
            'Content-Type': 'application/xml',
            'Authorization': 'Basic ' + auth
        },
      body: config.fileContents
    };

      var req = request(options, function(e, r, b) {
          if(e || r.statusCode !== 200) {
              return deferred.reject(e);
          }
        grunt.log.ok("update " + config.jobName);
        deferred.resolve(r.statusCode === 200);
      })();

    return deferred.promise;
  }

  function fetchJobConfigurationStrategy(job) {
    var deferred = q.defer();
    var url = [serverUrl, 'job', job, 'config.xml'].join('/');
    request(url, function(e, r, b) {
      var strategy = r.statusCode === 200 ? 'update' : 'create';
      deferred.resolve({strategy: strategy, jobName: job});
    });
    return deferred.promise;
  }

  function applyStrategy (strategyObj) {
    var deferred = q.defer(),
        filename = [fileSystem.pipelineDirectory, strategyObj.jobName, 'config.xml'].join('/'),
        fileStrategy = {fileName: filename, jobName: strategyObj.jobName};

    function resolve (val) {
      grunt.log.writeln (val);
      deferred.resolve(val);
    }

    if(strategyObj.strategy === 'create') {
      fileSystem.readFile(fileStrategy).
        then(createJob).
        then(resolve);
    } else if (strategyObj.strategy === 'update') {
      fileSystem.readFile(fileStrategy).
        then(updateJob).
        then(resolve);
    }

    return deferred.promise;
  }

  this.fetchGlobalConfigurations = function (){
    var deferred = q.defer();
    grunt.log.ok ("fetchGlobalConfigurations");

    var options = {
      url: [serverUrl, 'script'].join('/'),
      method: 'POST',
      body: "script=import+hudson.*%3B%0D%0Aimport+java.util.regex.*%3B%0D%0Aimport+hudson.model.*%3B%0D%0Aimport+java.lang.*%3B%0D%0Aimport+groovy.io.*%3B%0D%0Aimport+java.io.*%3B%0D%0Aimport+groovy.json.*%3B%09%0D%0Aimport+java.util.zip.ZipOutputStream%3B++%0D%0Aimport+java.util.zip.ZipEntry%3B%0D%0Aimport+java.nio.channels.FileChannel%3B%0D%0A%0D%0Ainstance+%3D+jenkins.model.Jenkins.instance%3B%0D%0A%0D%0Ajenkins_home+%3D+instance.rootDir%0D%0A%0D%0Adef+listConfigFiles+%3D+%7B++%0D%0A++prefix+-%3E%0D%0A++++listFile+%3D+%5B%5D%0D%0A+++new+File%28jenkins_home.absolutePath%29.eachFileMatch%28%7E%22.*xml%22+%29+%7B+f+-%3E%0D%0A++++++listFile.add+%28f.name%29%0D%0A+++%7D%0D%0A++return+%28listFile%29%0D%0A%7D%0D%0A++%0D%0AString+zipFileName+%3D+%22userContent%2Fconfig_bck.zip%22%0D%0AString+zipDir+%3D+jenkins_home%0D%0AZipOutputStream+zipFile+%3D+new+ZipOutputStream%28new+FileOutputStream%28zipDir+%2B+%22%2F%22+%2B+zipFileName%29%29%0D%0A%0D%0AlistConfigFiles+%28%29.each+%28%29++%7BconfigFile+-%3E%0D%0A++++def+file+%3D+new+File+%28zipDir+%2B+%22%2F%22+%2B+configFile%29%3B+++%0D%0A++++if+%28file.exists%28%29%29+%7B%0D%0A++++++++zipFile.putNextEntry%28new+ZipEntry%28file.getName%28%29%29%29++%0D%0A++++++++++++def+buffer+%3D+new+byte%5Bfile.size%28%29%5D++%0D%0A++++++++++++file.withInputStream+%7B+i+-%3E++%0D%0A++++++++++++++++def+l+%3D+i.read%28buffer%29++%0D%0A++++++++++++++++%2F%2F+check+wether+the+file+is+empty++%0D%0A++++++++++++++++if+%28l+%3E+0%29+%7B++%0D%0A++++++++++++++++++++zipFile.write%28buffer%2C+0%2C+l%29++%0D%0A++++++++++++++++%7D++%0D%0A++++++++%7D%0D%0A++++++++zipFile.closeEntry%28%29++++++++++++%0D%0A++++%7D%0D%0A%7D%0D%0AzipFile.close%28%29%0D%0A%0D%0Aprintln+%28%22OK%22%29",
      headers: {
        'Authorization': 'Basic ' + auth,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    request(options, function(e, r, b) {
      grunt.log.ok(" POST "  + r.statusCode);

      if(e || r.statusCode != '200') { return deferred.reject(e); }

      deferred.resolve('/userContent/config_bck.zip');
    });

    return deferred.promise;
  };

  this.downloadFile = function (url){
    grunt.log.ok ("downloadFile " + url);
    var deferred = q.defer();

    var options = {
      hostname: urlUtil.parse (serverUrl).hostname,
      url: [serverUrl, url].join('/'),
      port: urlUtil.parse (serverUrl).port,
      method: 'GET',
      path: urlUtil.parse (serverUrl).pathname + url,
      headers: {
        'Authorization': 'Basic ' + auth
      }
    };
    var complete = false;
    var content_length = 0;
    var downloaded_bytes = 0;
    var write_to_file = false;
    var write_file_ready = false;
    var local_file = "config_bck.zip";
    console.log (options)

   var request = http.get(options, function(response ) {
      switch(response.statusCode) {
        case 200:
          //this is good
          //what is the content length?
          content_length = response.headers['content-length'];
          break;
        case 302:
          new_remote = response.headers.location;
          self.download(new_remote, local_file, num+1 );
          return;
          break;
        case 404:
          return deferred.reject("File Not Found");
        default:
          //what the hell is default in this situation? 404?
          request.abort();
          return;
      }
      response.on('data', function(chunk) {
        //are we supposed to be writing to file?
        if(!write_file_ready) {
          //set up the write file
          write_file = fs.createWriteStream(local_file);
          write_file_ready = true;
        }
        write_file.write(chunk);
        downloaded_bytes+=chunk.length;
        percent = parseInt( (downloaded_bytes/content_length)*100 );
        console.log( percent );
      });
      response.on('end', function() {
        complete = true;
        write_file.end();
      });
    });
    request.on('error', function(e) {
      console.log("Got error: " + e.message);
    });


    return deferred.promise;
  };

}

module.exports = JenkinsServer;
