// Collects problems found while filling. Nothing is guessed: a field with a problem is left blank and reported.
class Issues {
  constructor(form) { this.form = form; this.list = []; }
  error(field, msg) { this.list.push({ form: this.form, level: 'error', field, msg }); }
  warn(field, msg) { this.list.push({ form: this.form, level: 'warn', field, msg }); }
  info(field, msg) { this.list.push({ form: this.form, level: 'info', field, msg }); }
}
export { Issues };
