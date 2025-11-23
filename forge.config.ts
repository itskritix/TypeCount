import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'TypeCount',
    productName: 'TypeCount',
    description: 'Professional keystroke analytics and productivity tracking',
    version: '1.0.0',
    copyright: '© 2024 TypeCount. All rights reserved.',
    category: 'Productivity',

    // App Bundle Configuration for macOS
    appBundleId: 'com.typecount.app',
    appCategoryType: 'public.app-category.productivity',

    // Icon configuration
    icon: './assets/logo', // Electron will automatically add .icns for macOS

    // Windows specific - request admin elevation
    win32metadata: {
      'requested-execution-level': 'requireAdministrator',
      'application-manifest': './app.manifest'
    } as any,

    // macOS specific
    // osxSign: false, // Set to signing config when ready
    // osxNotarize: false, // Set to notarization config when ready

    // ASAR and native modules
    asar: {
      unpack: "**/{*.node,*.dylib,*.so,*.dll}"
    },
    extraResource: [
      "assets"
    ],

    // Additional metadata
    protocols: [
      {
        name: 'TypeCount',
        schemes: ['typecount']
      }
    ]
  },
  rebuildConfig: {},
  makers: [
    // Windows: Squirrel installer (.exe)
    new MakerSquirrel({
      name: 'TypeCount',
      authors: 'itskritix',
      description: 'Professional keystroke analytics and productivity tracking',
      setupIcon: './assets/icon.ico',
      // Request admin elevation for the app
      setupExe: 'TypeCount-Setup.exe',
      remoteReleases: '',
    }),
    
    // macOS: DMG installer
    new MakerDMG({
      name: 'TypeCount',
      icon: './assets/icon.icns',
      format: 'ULFO', // compressed format
    }, ['darwin']),
    
    // macOS: ZIP for distribution
    new MakerZIP({}, ['darwin']),
    
    // Linux: DEB package (Debian/Ubuntu)
    new MakerDeb({
      options: {
        name: 'typecount',
        productName: 'TypeCount',
        genericName: 'Keystroke Analytics',
        description: 'Professional keystroke analytics and productivity tracking application',
        categories: ['Utility', 'Office'],
        maintainer: 'itskritix <itskritix@gmail.com>',
        homepage: 'https://github.com/typecount/typecount',
        icon: './assets/icon.png',
        section: 'utils',
        priority: 'optional',
      }
    }),
    
    // Linux: RPM package (Fedora/RHEL/CentOS)
    new MakerRpm({
      options: {
        name: 'typecount',
        productName: 'TypeCount',
        genericName: 'Keystroke Analytics',
        description: 'Professional keystroke analytics and productivity tracking application',
        categories: ['Utility', 'Office'],
        homepage: 'https://github.com/typecount/typecount',
        icon: './assets/icon.png',
        license: 'MIT',
      }
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
