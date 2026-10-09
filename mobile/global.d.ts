// `react-native-appsflyer` ships raw TypeScript (its `types` points at index.ts) and
// references the `jest` global in a runtime guard (`typeof jest === "undefined"`),
// but doesn't ship `@types/jest`. Declare it here so `tsc` stays green.
declare const jest: any;
