Component({
  properties: {
    src: {
      type: String,
      value: '',
      observer() {
        this.setData({ failed: false });
      },
    },
    name: { type: String, value: '苗族服饰' },
    tone: { type: String, value: 'indigo' },
  },
  data: { failed: false },
  methods: {
    imageError() {
      this.setData({ failed: true });
    },
  },
});
