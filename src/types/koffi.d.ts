declare module "koffi" {
  type NativeFunc = (...args: never[]) => unknown;
  type LoadedLib = {
    func: (signature: string) => NativeFunc;
  };
  const koffi: {
    load: (name: string) => LoadedLib;
  };
  export default koffi;
}
