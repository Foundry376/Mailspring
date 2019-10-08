module.exports = grunt => {
  grunt.config.merge({
    lesslint: {
      src: ['internal_packages/**/*.less', 'dot-nylas/**/*.less', 'static/**/*.less'],
      options: {
        less: {
          paths: ['static/style/', 'static/style/base/'],
        },
        imports: ['static/style/base/*.less'],
      },
    },
  });

  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-lesslint');
};
