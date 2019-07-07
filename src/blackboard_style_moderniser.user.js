// ==UserScript==
// @name        Blackboard Style Moderniser
// @author      Kenton Lam
// @description Improves some image assets on the site.
// @match       https://learn.uq.edu.au/*
// @version     0.1.3
// ==/UserScript==

(function() {
    let oldImg = document.querySelector('.brandingImgWrap .bannerImage');
    console.assert(oldImg, "BB logo not found");
    oldImg.style.opacity = '1';
    oldImg.style.transitionProperty = 'opacity';
    oldImg.style.transitionDuration = '500ms';
    oldImg.style.transitionTimingFunction = 'ease-in';

    let logoLink = document.querySelector('.brandingImgWrap a');
    logoLink.style.textDecoration = 'none';
    logoLink.href = 'https://learn.uq.edu.au';
    logoLink.removeAttribute('target');

    let span = document.createElement('span');
    span.style.display = 'flex';
    span.style.alignItems = 'center';
    span.style.marginLeft = '9px';
    span.style.marginTop = '19px';

    span.style.opacity = '0';
    span.style.transitionProperty = 'opacity';
    span.style.transitionDuration = '500ms';
    span.style.transitionTimingFunction = 'ease-out';

    let img = document.createElement('img');
    img.src = 'https://static.uq.net.au/v3/logos/corporate/uq-logo-white.svg';
    img.style.position = 'inherit';
    img.style.height = '44px';
    img.style.paddingRight = '16px';
    img.style.borderRight = 'white solid 1px';

    span.appendChild(img);
    img.onload = function() {
        setTimeout(() => {oldImg.style.opacity = '0';}, 0);
        setTimeout(() => {span.style.opacity = '1';}, 200);
    };

    let learnUQSpan = document.createElement('span');
    learnUQSpan.textContent = 'Learn.UQ';
    learnUQSpan.style.fontFamily = '"Segoe UI", "Helvetica", sans-serif';
    learnUQSpan.style.fontSize = '18pt';
    learnUQSpan.style.paddingLeft = '16px';
    learnUQSpan.style.color = 'white';
    learnUQSpan.style.fontWeight = '400';
    span.appendChild(learnUQSpan);

    logoLink.appendChild(span);
})();
