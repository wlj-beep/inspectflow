export default {
  test: {
    setupFiles: ["./test/vitest.setup.js"],
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true
      }
    }
  }
};
