// Official release assets, reviewed 2026-09-27. Never resolve latest at install time.
export const SOURCE_ADDON_SOURCES = [
  {
    id: "metamod",
    version: "1.12.0.1227",
    url: "https://github.com/alliedmodders/metamod-source/releases/download/1.12.0.1227/mmsource-1.12.0-git1227-linux.tar.gz",
    sha256: "d70aa8e6b8c88a2a6ff770aadc8e070e8a331ae4fb91a019f3dc19d352c04f5e",
    kind: "tar",
  },
  {
    id: "sourcemod",
    version: "1.12.0.7253",
    url: "https://github.com/alliedmodders/sourcemod/releases/download/1.12.0.7253/sourcemod-1.12.0-git7253-linux.tar.gz",
    sha256: "6bbcab989cda0ada83600d0dcb0f46affd16529b2b02ed2dba1b5baeaf02fdb4",
    kind: "tar",
  },
  {
    id: "counterstrikesharp",
    version: "v1.0.376",
    url: "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v1.0.376/counterstrikesharp-with-runtime-linux-1.0.376.zip",
    sha256: "8d50a25a467fe9c7ebbbc7032028d402cd428e118308f1c4d627a0a5ddf36783",
    kind: "zip",
  },
  {
    id: "swiftlys2",
    version: "v1.4.12",
    url: "https://github.com/swiftly-solution/swiftlys2/releases/download/v1.4.12/swiftlys2-linux-v1.4.12-with-runtimes.zip",
    sha256: "8669d29a0ab9920d104bcbd290d0c87339a23b3e0ff1286a42136884264f4ab8",
    kind: "zip",
  },
  {
    id: "modsharp",
    version: "git-169",
    url: "https://github.com/Kxnrl/modsharp-public/releases/download/git-169/ModSharp-git169-linux.zip",
    sha256: "9de896ed44c2078e88fc80a850c47e8fc97835f7125778ccd324609fd47ab66f",
    kind: "zip",
  },
  {
    id: "modsharp-runtime",
    version: "10.0.12",
    url: "https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.12/dotnet-runtime-10.0.12-linux-x64.tar.gz",
    sha256: "8458f4cef855fcebd139d9853e47fb0a5d86ab65d4aa101ea158a11e036c0fa4",
    kind: "tar",
  },
  {
    id: "metamod-cs2",
    version: "2.0.0.1472",
    url: "https://github.com/alliedmodders/metamod-source/releases/download/2.0.0.1472/mmsource-2.0.0-git1472-linux.tar.gz",
    sha256: "a4c7e962d4f704e55a91a560f1db024bd75ff38cdc2543a704a1151cda551fa6",
    kind: "tar",
  },
] as const;
