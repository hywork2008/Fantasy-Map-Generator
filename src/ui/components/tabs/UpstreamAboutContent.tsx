import type React from "react";
import { showSupporters } from "../../../controllers/options";

export const UpstreamAboutContent: React.FC = () => {
  return (
    <>
      <p>
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator" target="_blank" rel="noreferrer">
          Fantasy Map Generator
        </a>{" "}
        is an{" "}
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE" target="_blank" rel="noreferrer">
          open source
        </a>{" "}
        tool by Azgaar. You may use auto-generated maps as they are, edit them or even create a new map from scratch.
        Check out the{" "}
        <a
          href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Quick-Start-Tutorial"
          target="_blank"
          rel="noreferrer"
        >
          Quick start
        </a>
        ,{" "}
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Q&A" target="_blank" rel="noreferrer">
          Q&amp;A
        </a>
        ,{" "}
        <a href="https://youtube.com/playlist?list=PLtgiuDC8iVR2gIG8zMTRn7T_L0arl9h1C" target="_blank" rel="noreferrer">
          Video tutorial
        </a>
        , and{" "}
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Hotkeys" target="_blank" rel="noreferrer">
          hotkeys
        </a>{" "}
        for guidance.
      </p>

      <p>
        Join our{" "}
        <a href="https://discordapp.com/invite/X7E84HU" target="_blank" rel="noreferrer">
          Discord server
        </a>{" "}
        and{" "}
        <a href="https://www.reddit.com/r/FantasyMapGenerator/" target="_blank" rel="noreferrer">
          Reddit community
        </a>{" "}
        to ask questions, get help and share maps. The created maps can be used for free, even for commercial purposes.
      </p>

      <p>
        The project is under active development. Creator and main maintainer: Azgaar. To track the development progress
        see the{" "}
        <a href="https://trello.com/b/7x832DG4/fantasy-map-generator" target="_blank" rel="noreferrer">
          devboard
        </a>
        . For older versions see the{" "}
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog" target="_blank" rel="noreferrer">
          changelog
        </a>
        . Please report bugs on the{" "}
        <a href="https://github.com/Azgaar/Fantasy-Map-Generator/issues" target="_blank" rel="noreferrer">
          GitHub Issues page
        </a>
        . You can also contact me directly via{" "}
        <a href="mailto:azgaar.fmg@yandex.by" target="_blank" rel="noreferrer">
          email
        </a>
        .
      </p>

      <div>
        <a href="https://www.patreon.com/azgaar" target="_blank" rel="noreferrer">
          <div>
            <div>
              <svg viewBox="0 0 569 546" aria-hidden="true">
                <circle cx="362.589996" cy="204.589996" data-fill="1" id="Oval" r="204.589996" />
                <rect data-fill="2" height="545.799988" id="Rectangle" width="100" x="0" y="0" />
              </svg>
            </div>
            SUPPORT ON PATREON
          </div>
        </a>
      </div>

      <p>
        Special thanks to{" "}
        <button type="button" data-tip="Click to see list of supporters" onClick={showSupporters}>
          all supporters
        </button>{" "}
        on Patreon!
      </p>

      <div className="d-flex">
        <a href="https://u24.gov.ua/" data-tip="Support Ukraine" target="_blank" rel="noreferrer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1000 350"
            role="img"
            aria-label="Support Ukraine - u24.gov.ua"
          >
            <rect width="100%" height="100%" fill="#005bbb"></rect>
            <rect y="50%" width="100%" height="50%" fill="#ffd500"></rect>
            <text x="50%" textAnchor="middle" fontSize="8em" y="32%" fill="#f5f5f5">
              Support Ukraine
            </text>
            <text x="50%" textAnchor="middle" fontSize="4em" y="78%" fill="#005bdd">
              u24.gov.ua
            </text>
          </svg>
        </a>
      </div>

      <div>
        <p>Check out our other projects:</p>
        <div>
          •{" "}
          <a href="https://azgaar.github.io/Armoria" target="_blank" rel="noreferrer">
            Armoria
          </a>
          : a tool for creating heraldic coats of arms
        </div>
        <div>
          •{" "}
          <a href="https://deorum.vercel.app" target="_blank" rel="noreferrer">
            Deorum
          </a>
          : a vast gallery of customizable fantasy characters
        </div>
      </div>

      <div>
        Chinese localization:{" "}
        <a href="https://www.8desk.top" target="_blank" rel="noreferrer">
          8desk.top
        </a>
      </div>

      <ul className="share-buttons">
        <li>
          <a
            href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator%2F&quote="
            data-tip="Share on Facebook"
            target="_blank"
            rel="noreferrer"
          >
            <img alt="Share on Facebook" src="images/Facebook.png" loading="lazy" />
          </a>
        </li>
        <li>
          <a
            href="https://twitter.com/intent/tweet?source=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator&text=%23FantasyMapGenerator%0A%0Ahttps%3A//azgaar.github.io/Fantasy-Map-Generator"
            target="_blank"
            rel="noreferrer"
            data-tip="Tweet"
          >
            <img alt="Tweet" src="images/Twitter.png" loading="lazy" />
          </a>
        </li>
        <li>
          <a
            href="http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator"
            target="_blank"
            rel="noreferrer"
            data-tip="Pin it"
          >
            <img alt="Pin it" src="images/Pinterest.png" loading="lazy" />
          </a>
        </li>
        <li>
          <a
            href="http://www.reddit.com/submit?url=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator"
            target="_blank"
            rel="noreferrer"
            data-tip="Submit to Reddit"
          >
            <img alt="Submit to Reddit" src="images/Reddit.png" loading="lazy" />
          </a>
        </li>
        <li>
          <a href="https://discord.gg/X7E84HU" target="_blank" rel="noreferrer" data-tip="Join Discord server">
            <img alt="Join Discord server" src="images/Discord.png" loading="lazy" />
          </a>
        </li>
      </ul>
    </>
  );
};
