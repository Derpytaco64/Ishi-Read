# ***Disclaimer***
I cloned the thorium repository and have been vibecodin the fuck out of it so that the reader and library page behave the way I want them to. I can not promise that this is a stable, secure, or well engineered app, but I can say that I test every feature I try to have Claude make so that it functions at the least. If you happen to try this personal project, bug reports would be nice.

# Example Images
![](./screenshots/Screenshot_20260725_011246.png)
![](./screenshots/Screenshot_20260725_011309.png)
![](./screenshots/Screenshot_20260725_011340.png)
![](./screenshots/Screenshot_20260725_011434.png)
![](./screenshots/Screenshot_20260725_011446.png)
![](./screenshots/Screenshot_20260725_011514.png)
![](./screenshots/Screenshot_20260725_011536.png)

# Install
- For now I think you can just install it from docker hub? dt64/ishi-read/
- You will need to set up a reverse proxy through something like nginx for readium to be able to provide things like covers, metadata, and and everything else. Theres also a set up wizard that I think is working?

# More Stuff to fix/add
### Bugs
- Mobile site
	- Potentially fixed
		- *block the normal context menu so the note context menu works*
			- *notes suddenly scroll too far or displace the reading frame*
		- *make the chapter name and page # not fade out when you read on mobile and add that as a reader setting. make the return to position button follow the same behavior*
		- *the position on the bottom doesnt update or show the % instead of the page # in scrollable mode*
		- *fix headers at the top of the screen under lapping the logo and profile icon on the library page*
			- *probably scale the text logo and user icon to fit together*
		- *book detail view on mobile can't scroll up further when the book cover reaches the top of the screen* 
			- *it looks like the top div condenses but doesn't scroll the whole thing*
			- *tap and dragging the play button does the correct scrolling behavior???*
		-  *I don't know if the same book info tracking is working*
			- *does it check the books hash before creating a new entry for it?*
			- *or just generate it and move forward*
		-  *I think position is being stored on a larger page than than they're all on PC than on mobile at the same text size*
			- *if you exit a book on mobile and reenter it can be off by 2 pages of 816*
			- *go to position also breaks, going to 50 out of 816 drops you at about page 70 of 816*
			- *Toggling full screen breaks page counting somehow*
				- *if you page forward in full screen then exit it it seems to take you back to the position you were at when you entered it*
	- New problems after the big mobile fix attempt
		- chrome visibility still shows the three dot hamburger icon, the timer icon, and the exit to library icon when enabled when it shouldnt, they should have the fade behavior regardless of chrome visibility
			- give the timer its own chrome visibility toggle with the title "Visible Timer"
		- Change chrome visiblities' name to "Visible Chapter and Page" and fix its ui
		- the fixed home heading and icons are wonky and need adjustment
		- highlighting text on mobile doesnt show the annotation menu immediately or hide and reveal it again when changing the selection via click and drag and if you tap on the selection it will show the menu and properly apply the commands but it wont show the visual of whats been highlighted after the menu appears
		- the fix that made font size change position retention work should be applied to saved positions so that we can return to the exact position we left off on
			- that chnge should also apply to window resizes and fullscreen
				- full screen: 54/816 -> 45/684 -> 49/816 -> 39/684 -> 41/816
					- progressively strays from original position backwards
- ~~Make "Words Read" stat follow the same data filter as wpm so the number isn't crazy inflated~~
- ~~Changing font size does not retain the position when going from large to small~~
	- ~~Say you are at page 5 of 800 and you decrease the font size by a large amount. The place you end up is very far off instead of by the closest position of the original font sizes position, the start of the page basically. this my testin on mobile had me jumping from 50 of 800 to 200 of 80 after a large to small back to large font change.~~
- ~~there seems to be desync for the percent read on the home page, a book in reader said 10.1% while the library said 12.1%~~
- ~~Audiobook "Time spent listening" stat does not track when the browser is out of focus~~
- ~~wpm might need more robust filter or use global sampling instead of per book so that it always has correct calcs~~
### Features
- Search bar for books
	- title
	- author
	- release range
	- genre
	- page # range
- ~~subdirectory search~~
- ~~disable user toggle so they don't show on the log in screen~~
- userdata back up in the user icon context menu
- ~~make the cover size setting local~~
- ~~series first cover display bug~~
- ~~add a slider for text and margin size~~
- make audiobook grid icons square in library
- Ability to change left and right side behaviors; page forward and page backward
- ~~Make all reader settings except theme and font choice a local setting instead of a serverside one~~

# Original Design and Deploy notes/fixes
## Progress Tracking
- ~~Base thorium appears to save book position in your browser's local storage instead of alongside the server's files~~
- ~~The first step to enabling reader progress saving at the server level is changing the save location from the browser that loads the website to the server itself~~
	- Tracking a specific account's progress via a tag would also be a nice feature
- After that we need a way to read books without Internet connection in the case of an android app. This will require a way to connect to the server and stream the books while syncing the *most recent* position update to the server
- It would need a way to download the books to the device and present them while tracking the position. Then a way to track the same book. Probably the base64 encoding we currently use for book web pages and resolve which state is the most recent upon reconnection to the server.
- ~~For sync purposes the books should probably be identified with a deterministic hash like with KOsync~~
## Login Page
- ~~Base thorium doesn't have accounts or a log in page so it will be imperative to create a firm security front to prevent bad actors from getting into the site.~~
- ~~This mean I will need accounts, log ins, and a way to prevent each page on the site from being accessed without valid credentials along with a way to encrypt the check for those credentials.~~
## Library Interface
- ~~Move the settings menu to an overlay accessed by clicking the logo~~
	- Have all the reader settings there
	- Light dark mode button
	- User stuff once we get there
- ~~Custom shelves~~
- ~~Automatic series shelves based off the readium meta data~~
- ~~Make the last read series thing on the homepage one wide and you click the right to move further in the volumes~~
- ~~Series # ordering~~
- ~~Meta data view~~
	- ~~Display the 1024 character "pages" calculated by readium and the pages based on the current viewport settings~~
- ~~The settings menu should have fields for the readium server url, epub directory, and the userdata folder~~
- ~~Note and etc. access outside the book~~
- ![[Pasted image 20260719094350.png]]
	- ~~Done~~
## Reader Functions
- Thorium already has a lot of features out of the box but I would like to add some
	- ~~Allow setting the margin, and font size manually~~
		- couldn't get vertical margin to work, the default seems fine.
	- ~~Make landscape images render across two pages in double column mode~~
	- ~~more keyboard shortcuts?~~
		- ~~Tab - Table of Contents~~
		- ~~Up Arrow - Zoom in~~
		- ~~Down Arrow - Zoom out~~
		- ~~Escape - Exit to library~~
	- ~~Highlighting~~
	- ~~Bookmarking~~
	- ~~Notes~~
		- Accessible outside of the book itself
	- ~~Dictionary Integration~~
	- ~~Track time spent reading~~
		- ~~Reset~~
		- ~~Save Completion times~~
		- ~~Display~~
			- ~~Delete~~
	- ~~words per minute tracking~~
	- ~~Click on image to expand it with a easy to click button to leave it~~
	- ~~Dynamic page number and current page display based on the viewport and remaining "pages"~~
## Set up/Need to fix
### Need to fix
- readium doesn't like cross device origin so we need a proxy URL for it with a SSL so when a non local device connects it provides the manifest/images (http to https). this may be circumvented with nginx
	- ~~probably make the url and port an editable field so we can change it~~
- ~~Make the create custom shelf UI follow the accent color~~
	- ~~scroll for more emojis?~~
- ~~Add the create custom shelf tab to the library right click context menu~~
- ~~Make the last series read last home section only 1 row wide but navigable by clicking arrows on the left and right like a carousel~~
	- ~~do the same thing with the recently added and make its cap 20~~
- ~~make the display settings menu in the reader's scroll bar the same style as the applied theme~~
- ~~make it so we can change/migrate the user data folder~~
- ~~user system/login page~~
	- ~~same system as jellyfin~~
- ~~User stats page~~
	- ~~lets add a Stats page to the user icon context menu that brings up a pop up with info like the number of books in the library, the number of minutes spent reading, the average words per minute, the number of eat type of annotation~~
- ~~make notes/highlights/bookmarks say their chapter/toc name so their position is easier to understand in the export and everything~~
	- ~~especially for bookmarks, they shouldn't show the epub appendix title~~
- ~~admin panel setting to change the port readium starts on in case you need it to not be 15080~~
### Set up
- I should be able to deploy it from a docker. It needs read and write permissions., the volume for the save data
- readiums http to https proxy

# Thorium Web

Thorium Web is a web-based reader for EPUB and other digital publications, built using Next.js and modern web technologies. It is designed to provide a fast, responsive, and accessible reading experience.

![Thorium Web in a browser with settings and table of contents panels open. Default settings such as font-size, font-family, and themes are visible in the overflowing settings panel. In table of contents, the current entry is indicated, and its parent entry is expanded.](./thorium-web.png)

## Features

- Supports EPUB
- Fast and responsive rendering of publications using Next.js
- Accessible design for readers with disabilities
- Customizable reading experience with themes, adjustable font sizes, line heights, word- and letter-spacing, etc.

## Getting Started

There are two ways to get started with Thorium Web:

- Using the Next.JS App as is
- Using the Thorium Web package in your own project

You can take a look at the [Implementers’ Guide](./docs/ImplementersGuide.md) for more details.

### Using the Next.JS App as is

To get started with Thorium Web, follow these steps:

- Fork or clone the repository: `git clone https://github.com/edrlab/thorium-web.git`
- Install dependencies: `pnpm install`
- Start the development server: `pnpm dev`
- Open the reader in your web browser: [http://localhost:3000](http://localhost:3000)

The development server will automatically reload the page when you make changes to the code.

### Using the Thorium Web package in your own project

To use Thorium Web in your own project, install the package and its peer dependencies:

```bash
npm install @edrlab/thorium-web @readium/css @readium/navigator @readium/navigator-html-injectables @readium/shared react-redux @reduxjs/toolkit i18next i18next-browser-languagedetector i18next-http-backend motion react-aria react-aria-components react-stately react-modal-sheet react-resizable-panels 
```

Then you can import and use the components in your own code:

```tsx
import { StatefulReader } from "@edrlab/thorium-web/epub"

const MyApp = () => {
  // ... fetch the manifest and get its self link href
  return (
    <StatefulReader
      rawManifest={ manifestObject }
      selfHref={ manifestSelfHref }
    />
  )
}
```

You can use the StatefulReader component to use the same exact Reader component as the one in the Next.JS App, but with your own [plugins, store and preferences](./docs/packages/Epub/Guide.md). Or you can use its components to build your own custom reader.

> [!IMPORTANT]
> At this point in time, when using components from `@edrlab/thorium-web/epub`, you have to import the store/lib, hooks and Preferences Provider from the same path, otherwise your custom app will use another instance.

## Customizing

You can customize this project extensively through [Preferences](./src/preferences.ts): breakpoints, which and how to display actions, themes provided to users, configuration of the docking system, sizes and offsets of icons, etc.

See [Customization in docs](./docs/customization/Customization.md) for further details.

## Building and Deploying

To build and deploy Thorium Web, run the following commands:

```bash
pnpm build
pnpm run deploy
```

This will create a production-ready build of the reader and deploy it to the specified hosting platform.

This repository is using the following configuration:

- Go-Toolkit on Google Cloud Run
- Thorium Web App on CloudFlare Pages
- Assets e.g. demo EPUBs stored on Google Cloud Storage

To deploy, the following script is run: 

```bash
npx @cloudflare/next-on-pages && npx wrangler pages deploy
```

It’s running with defaults, which means a commit triggers a build and deploy for the current branch to preview. You can then access the app from a subdomain using this branch name. 

More details in [the @cloudflare/next-on-pages repo](https://github.com/cloudflare/next-on-pages).

## Known Issues

- Fullscreen is not available on iOS and very limited on iPadOS. We encountered so many issues on iPadOS that it has been disabled for the time being.
- on iPadOS, when the app is requested in its desktop version, some interventions are implemented in Safari to provide users with a “desktop-class experience.” Unfortunately, one of this intervention is impacting the font-size setting, and requires a flag to be toggled in the Preferences API in order to apply a patch. However, this patch may not catch all edge cases.

## Contributing

We welcome contributions to Thorium web! If you're interested in helping out, please fork this repository and submit a pull request with your changes.

The only exception to this rule is localization files, which are managed through a separate process. Please see the [Localization](./docs/Localization.md) documentation for more details.

## License

Thorium Web is licensed under the [BSD-3-Clause license](https://opensource.org/licenses/BSD-3-Clause).

## Acknowledgments

Thorium Web is built using a number of open-source libraries and frameworks, including [Readium](https://readium.org/), [React](https://reactjs.org/), [React Aria](https://react-spectrum.adobe.com/react-aria/index.html), and [Material Symbols and Icons](https://fonts.google.com/icons). We are grateful for the contributions of the developers and maintainers of these projects.
