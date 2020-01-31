(function($) {
  $.fn.classIf = function(condition, className) {
    if (condition)
      this.addClass(className);
    else this.removeClass(className);

    return this;
  };
})(jQuery);
