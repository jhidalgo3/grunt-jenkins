 
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({

jenkins: {
  serverAddress: 'http://localhost:9080',
  pipelineDirectory: 'jenkins-pipeline',
  user: 'admin',
  pass: '0807af738fe3a5da3b9eedd0c7e42acf'
}
});

   grunt.loadNpmTasks('grunt-jenkins');

};
