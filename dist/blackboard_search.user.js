// ==UserScript==
// @name        Blackboard Search Enhancements
// @description Searches blackboard.
// @match       https://learn.uq.edu.au/*
// @version     0.1
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @require     https://cdnjs.cloudflare.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/featherlight/1.7.13/featherlight.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/fuse.js/3.2.0/fuse.min.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.10/lodash.min.js
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.js
// @require     https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.js
// ==/UserScript==


if (window.location.href.indexOf('/courseMenu.jsp') !== -1) return;

/* Queue.js */
//code.iamkate.com
function Queue(){var a=[],b=0;this.getLength=function(){return a.length-b};this.isEmpty=function(){return 0==a.length};this.enqueue=function(b){a.push(b)};this.dequeue=function(){if(0!=a.length){var c=a[b];2*++b>=a.length&&(a=a.slice(b),b=0);return c}};this.peek=function(){return 0<a.length?a[b]:void 0}};


let cssId = 'featherlightCSS';  
let head  = document.getElementsByTagName('head')[0];
let link  = document.createElement('link');
link.id   = cssId;
link.rel  = 'stylesheet';
link.type = 'text/css';
link.href = 'https://cdnjs.cloudflare.com/ajax/libs/featherlight/1.7.13/featherlight.min.css';
link.media = 'all';
link.onload = (function BlackboardSearch() {

    // 2^53 - 1
    let MAX_INT = Number.MAX_SAFE_INTEGER || 9007199254740991;
    let $ = jQuery.noConflict(true);

    class BlackboardTreeParser {
        constructor() {
            this.callback = function() {};
            this.courseId = '';
            this.retryCount = 0;
            this.treeData = {};
            this.locked = false;
        }

        parseTree(courseId, callback) {
            this.courseId = courseId;
            this.callback = callback;
            this.retryCount = 0;
            this.locked = true;
            this.appendIFrame();
        }

        isUpdating() {
            return this.locked;
        }

        parseOneUL(listNode, rootName) {
            for (let j = 0; j < listNode.children.length; j++) {
                if (listNode.children[j].tagName.toUpperCase() === 'LI') {
                    let li = listNode.children[j];
                    let text = li.children[2].textContent.trim();
                    let thisName = _.concat(rootName, text);
                    this.treeData.items.push({
                        'link': li.children[2].href,
                        'label': thisName
                    });
    
                    if (li.children.length > 3 && li.children[3].tagName.toUpperCase() === 'UL') 
                        this.parseOneUL(li.children[3], thisName);
                }
            }
        }

        startTreeParse(rootDiv) {
            this.treeData = {
                'time': Date.now(),
                'courseId': this.courseId,
                'courseName': this.courseName,
                'courseCode': this.courseCode,
                'items': [],
            };
            for (let i = 0; i < rootDiv.children.length; i++) {
                this.parseOneUL(rootDiv.children[i], [this.courseCode]);
            }
            return this.treeData;
        }

        bootstrapTreeParse() {
            this.retryCount++;
            function retry() {
                setTimeout(this.bootstrapTreeParse.bind(this), 100*Math.pow(2, this.retryCount-1));
            }
            
            console.log('bootstrap tree parse:');
            console.log(this);
            let frameDoc = this.iframe.contentDocument;
            frameDoc.querySelector('#expandAllLink').click();
            let div = frameDoc.querySelector('#courseMenu_folderView');
            if (div === null || frameDoc.querySelector('.--empty--') !== null) {
                retry.call(this);
                return false;
            } else {
                console.log('parsing');
                let tree = this.startTreeParse.call(this, div);
                
                if (!tree.items.length) {
                    retry.call(this);
                    return false;
                }
                this.iframe.parentNode.removeChild(this.iframe);
                this.retryCount = 0;
                this.locked = false;
                return this.callback(tree);
            }
        }

        iframeOnLoad() {
            console.log(this);
            let courseTitle = this.iframe.contentDocument.querySelector('#courseMenu_link').textContent;
            let codeMatch = /^\[([A-Z0-9/]+)\]/i.exec(courseTitle);
            if (!codeMatch) throw new Error('No matched course code: ' + courseTitle);
            let letters = codeMatch[1].slice(0, 4);
            let courseCode = codeMatch[1].split('/');
            for (let c = 0; c < courseCode.length; c++) {
                if (courseCode[c].length <= 4) {
                    courseCode[c] = letters + courseCode[c];
                }
            }

            this.courseName = courseTitle.replace(codeMatch[0] + ' ', '');
            this.courseCode = courseCode.join('\u200A/\u200A');

            console.log('iframe that: ');
            console.log(this);
            if (this.iframe.contentDocument.getElementById('courseMapButton'))
                this.callback(null);
            else
                this.bootstrapTreeParse.call(this);
        }

        appendIFrame() {
            console.log('inserting iframe');
            if (document.getElementById('userscript-search-iframe') !== null) {
                throw new Error('Blackboard search IFrame already exists.');
            }
            this.iframe = document.createElement('iframe');
            this.iframe.id = 'userscript-search-iframe';
            this.iframe.src = 'https://learn.uq.edu.au/webapps/blackboard/content/courseMenu.jsp?course_id=' + 
                this.courseId +'&newWindow=true'; // &openInParentWindow=true
            this.iframe.onload = this.iframeOnLoad.bind(this);
            this.iframe.style.width = '210px';
            this.iframe.style.display = 'none';
            
            document.getElementById('navigationPane').appendChild(this.iframe);
        }
    }

    class BlackboardSearchManager {
        constructor(pageCourseId) {
            this.courseDataObject = {};
            this.linkItems = [];
            this.fuse = new Fuse(this.linkItems, {
                shouldSort: true,
                tokenize: true,
                matchAllTokens: true,
                maxPatternLength: 32,
                minMatchCharLength: 2,
                keys: [
                    'label'
                ],
                threshold: 0.2,
            });
            this.selectedRow = null;
            this.coursesToUpdate = [];
            this.pageCourseId = pageCourseId;

            this.parser = new BlackboardTreeParser();

            this.config = new GM_configStruct();
            /**
             * @type {Object<string, Date>[]}
             */
            this.weekDefinitions = [];
            this.initialiseSettings();

            if (!this.courseDataObject.hasOwnProperty(this.pageCourseId)) {
                this.updateCourse(this.pageCourseId);
            }
        }

        doSearch(event, force=false) {
            if (!force && !$.featherlight.current()) return false;
            while (this.searchResults.hasChildNodes()) {
                this.searchResults.removeChild(this.searchResults.lastChild);
            }
            let query = this.searchBox.value.trim();

            let selectedRowInResults = false;
            if (!query) {
                for (let i = 0; i < this.linkItems.length; i++) {
                    const item = this.linkItems[i];
                    if (item.label[1] === 'Announcements') {
                        this.searchResults.appendChild(item.element);
                        $(item.element).fadeIn(200);
                        if (item.element === this.selectedRow)
                            selectedRowInResults = true;
                    }
                }
                console.log(this.selectedRow);
                if (!this.selectedRow) {
                    this.selectRow(this.searchResults.firstElementChild);
                    selectedRowInResults = true;
                }
            } else {
                let results = this.fuse.search(query);
                
                for (let i = 0; i < Math.min(results.length, 50); i++) {
                    let r = results[i].element;
                    this.searchResults.appendChild(r);
                    $(r).hide().fadeIn(200);
                    if (r === this.selectedRow)
                        selectedRowInResults = true;
                }
                if (!this.selectedRow && results.length) {
                    this.selectRow(results[0].element);
                    selectedRowInResults = true;
                }
            }
            if (!selectedRowInResults) 
                this.selectRow(null);

            if (event) {
                event.preventDefault();
            }
            return false;
        }

        selectPreviousRow() {
            if (this.selectedRow.previousElementSibling)
                this.selectRow(this.selectedRow.previousElementSibling);
            else 
                this.selectRow(this.selectedRow.parentNode.lastElementChild);
        }

        selectNextRow() {
            if (this.selectedRow.nextElementSibling)
                this.selectRow(this.selectedRow.nextElementSibling);
            else 
                this.selectRow(this.selectedRow.parentNode.firstElementChild);
        }

        selectRow(row) {
            if (row) {
                row.classList.add('search-selected');
                row.firstElementChild.focus();
                this.searchBox.focus();
            }
            if (this.selectedRow)
                this.selectedRow.classList.remove('search-selected');
            this.selectedRow = row;
        }

        searchKeyHandler(event) {
            switch (event.which) {
                case 38: // up
                    if (!this.selectedRow)
                            this.selectRow(this.searchResults.firstElementChild);
                        else 
                            this.selectPreviousRow();
                break;
        
                case 40: // right
                    if (!this.selectedRow)
                        this.selectRow(this.searchResults.firstElementChild);
                    else 
                        this.selectNextRow();
                break;

                case 13:
                    if (this.selectedRow)
                        window.open(this.selectedRow.firstElementChild.href, '_self');
                break;
                default: return; // exit this handler for other keys
            }
            event.preventDefault();
        }

        tickTime() {
            this.timeSpan.textContent = new Date().toLocaleTimeString(  
                    undefined, {hour: '2-digit', minute: '2-digit'});

            if ($.featherlight.current()) {
                setTimeout(this.tickTime.bind(this), 60000-Date.now()%60000);
            }
        }

        tickDateAndCalendar() {
            this.dateSpan.textContent = new Date().toLocaleDateString(undefined,
            {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            this.semesterSpan.textContent = '';
            this.weekSpan.textContent = '';

            let now = new Date();
            let msPerWeek = 7*24*60*60*1000;
            console.log('updating calendar');
            console.log(this.weekDefinitions);
            for (let d = 0; d < this.weekDefinitions.length; d++) {
                const w = this.weekDefinitions[d];
                if (now >= w.startDate && now < w.endDate) {
                    this.weekSpan.textContent = 'Week ' + 
                        (Math.max(Math.floor((now-w.startMonday) / msPerWeek), 0) + w.startNum);
                    this.semesterSpan.textContent = w.name;
                    break;
                }
            }

            if ($.featherlight.current()) {
                let msPerDay = 24*60*60*1000;
                setTimeout(this.tickDateAndCalendar.bind(this), 
                    msPerDay-Date.now()%msPerDay);
            }
        }

        refreshTimeElements() {
            this.tickTime();
            this.tickDateAndCalendar();
        }

        createElement(element, options) {
            var el = document.createElement(element);
            if (options)
                _.assign(el, options);
            return el;
        }

        createWindow(rootNode) {
            this.searchWindow = document.createElement('div');
            this.searchWindow.id = 'userscript-search-window';

            this.header = document.createElement('div');
            this.header.id = 'userscript-header';
            
            this.dateTimeSpan = document.createElement('span');
            this.dateTimeSpan.id = 'userscript-date-time';
            this.timeSpan = document.createElement('span');
            this.timeSpan.id = 'userscript-time';
            this.dateSpan = document.createElement('span');
            this.dateSpan.id = 'userscript-date';
            this.dateTimeSpan.appendChild(this.timeSpan);
            this.dateTimeSpan.appendChild(document.createElement('br'));
            this.dateTimeSpan.appendChild(this.dateSpan);

            this.tickTime();
            this.header.appendChild(this.dateTimeSpan);

            this.calendar = this.createElement('span', {
                id: 'userscript-calendar'
            });
            this.weekSpan = this.createElement('span', {
                id: 'userscript-week',
                textContent: 'Week 4',
            });
            this.calendar.appendChild(this.weekSpan);
            this.calendar.appendChild(this.createElement('br'));
            this.semesterSpan = this.createElement('span', {
                id: 'userscript-semester',
                textContent: 'Semester 1, 2018',
            });
            this.calendar.appendChild(this.semesterSpan);
            this.tickDateAndCalendar();
            this.header.appendChild(this.calendar);

            this.searchWindow.appendChild(this.header);


            this.searchForm = document.createElement('form');
            this.searchForm.id = 'userscript-search-form';
            
            this.searchBox = document.createElement('input');
            this.searchBox.id = 'userscript-search-input';
            this.searchBox.type = 'search';
            this.searchBox.name = 'search';
            this.searchBox.setAttribute('autocomplete', 'off');
            this.searchBox.tabIndex = 0;
            this.searchBox.addEventListener('input',
                _.debounce(this.doSearch.bind(this), 200));
            $(this.searchBox).keydown(
                this.searchKeyHandler.bind(this));
        
            this.searchForm.appendChild(this.searchBox);
        
            this.searchButton = document.createElement('input');
            this.searchButton.type = 'submit';
            this.searchButton.style.display = 'none';
            this.searchButton.onclick = _.noop;
            this.searchForm.appendChild(this.searchButton);
        
            this.searchWindow.appendChild(this.searchForm);

            this.searchResults = document.createElement('ul');
            this.searchResults.id = 'userscript-search-results';
            this.searchWindow.appendChild(this.searchResults);

            
            this.footerDiv = document.createElement('div');
            this.footerDiv.id = 'userscript-search-footer';
            
            this.updateButton = document.createElement('span');
            this.updateButton.id = 'userscript-update-button';
            this.updateButton.textContent = 'Refresh';
            this.updateButton.onclick = this.updateAllCourses.bind(this);
            this.footerDiv.appendChild(this.updateButton);

            this.footerDiv.appendChild(document.createTextNode(' | '));

            this.settingsButton = document.createElement('span');
            this.settingsButton.id = 'userscript-options-button';
            this.settingsButton.textContent = 'Options';
            this.settingsButton.onclick = this.showConfig.bind(this);
            this.footerDiv.appendChild(this.settingsButton);
            
            this.searchWindow.appendChild(this.footerDiv);

            return this.searchWindow;
        }

        appendSearchForm(root) {
            root.appendChild(this.searchWindow);
        }

        updateAllCourses() {
            _.forEach(_.keys(this.courseDataObject), function (id) {
                this.updateCourse(id);
            }.bind(this));
        }

        updateCourse(courseId) {
            if (!this.parser.isUpdating()) {
                this.parser.parseTree(courseId, this.parseTreeCallback.bind(this));
            } else {
                console.log('already updating');
                this.coursesToUpdate.push(courseId);
            }
        }

        getCourseObject(courseId) {
            return this.courseDataObject[courseId];
        }

        maybeUpdateCourse(courseObject) {
            let courseId = courseObject.courseId;
            let updateInterval;
            if (courseId === this.pageCourseId) 
                updateInterval = this.config.get('CurrentCourseUpdateInterval');
            else
                updateInterval = this.config.get('OtherCourseUpdateInterval');

            if (Date.now() - courseObject.time > updateInterval*60000) {
                console.log('updating '+courseId);
                this.updateCourse(courseObject.courseId);
            }
            console.log(this.pageCourseId);
            console.log('not updating ' + courseId);
            console.log(Date.now() - courseObject.time);
            console.log(updateInterval*60000);
        }

        maybeUpdateAllCourses() {
            _.forEach(this.courseDataObject, this.maybeUpdateCourse.bind(this));
        }

        parseTreeCallback(treeData) {
            if (treeData) {
                console.log(JSON.stringify(treeData, undefined, 2)); 
                let courseId = treeData.courseId;
                this.courseDataObject[courseId] = treeData;
            }
            if (this.coursesToUpdate.length === 0) {
                this.updateLinks();
                this.storeCourseData();
            } else {
                let course = this.coursesToUpdate.pop();
                this.updateCourse(course, true);
            }
        }

        storeCourseData() {
            this.config.set('CourseDataLZ', 
                LZString.compressToUTF16(JSON.stringify(this.courseDataObject)));
            this.config.save();
        }

        formatLinkText(textArray) {
            return textArray.join(' > ');
        }

        updateLinks() {
            _.remove(this.linkItems, function() {return true;});
            _.forEach(_.values(this.courseDataObject), function(o) {
                this.linkItems.push(...o.items);
            }.bind(this));
            _.forEach(this.linkItems, function(item) {
                let li = document.createElement('li');
                let a = document.createElement('a');
                a.href = item.link;
                a.textContent = this.formatLinkText(item.label);
                li.appendChild(a);
                item.element = li;
            }.bind(this));
            return this.linkItems;
        }

        updateWeekDefinitions() {
            console.log(this);
            _.remove(this.weekDefinitions);
            let weekLines = this.config.get('WeekDefinitions').split('\n');

            let weekRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d+)?\s+(.+)$/;
            for (let index = 0; index < weekLines.length; index++) {
                let line = weekLines[index].trim();
                try {
                    console.log(line);
                    let w = weekRegex.exec(line);
                    if (!w) {
                        console.log('Invalid week definition: '+line);
                        continue;
                    }
                    let start = new Date(Number(w[1]), Number(w[2])-1, Number(w[3]), 0, 0, 0);
                    let end = new Date(Number(w[4]), Number(w[5])-1, Number(w[6]), 24, 0, 0);
                    
                    // Relative Monday. For calculating week number.
                    // If 'start' falls on a weekend, startMonday will be 
                    // the _following_ Monday. Otherwise, it is the preceding
                    // Monday. Clone date object.
                    let startMonday = new Date(start.getTime());
                    // Where 1 = Monday, ..., 7 = Sunday.
                    let startDayOfWeek = (startMonday.getDay()+6) % 7 + 1;
                    if (startDayOfWeek >= 6) {
                        startMonday.setDate(
                            startMonday.getDate() + 7 - startDayOfWeek + 1);
                    } else {
                        startMonday.setDate(
                            startMonday.getDate() - startDayOfWeek + 1);
                    }

                    let numStart;
                    if (!w[7]) 
                        numStart = 1;
                    else 
                        numStart = Number(w[7]);
                    let text = w[8];
                    this.weekDefinitions.push({
                        startDate: start,
                        startMonday: startMonday,
                        endDate: end,
                        startNum: numStart,
                        name: text,
                    });
                } catch (e) {
                    console.log('Invalid week definition: ' + line);
                }
            }
            console.log(this.weekDefinitions);
        }

        initialiseSettings() {
            this.config.init({
                id: 'BlackboardSearchConfig',
                title: 'Search Options',
                fields: {
                    'CourseDataLZ': {
                        type: 'hidden',
                        default: LZString.compressToUTF16("{}")
                    },
                    'CurrentCourseUpdateInterval': {
                        label: 'Active update interval (minutes)',
                        title: 'How often to update when a course page is visited.',
                        type: 'unsigned float',
                        default: 120
                    },
                    'OtherCourseUpdateInterval': {
                        label: 'Background update interval (minutes)',
                        type: 'unsigned float',
                        default: 360
                    },
                    'WeekDefinitions': {
                        label: 'Calendar',
                        type: 'textarea',
                        default: `2018-02-19 2018-04-01 1 Semester 1
2018-04-02 2018-04-15 1 Mid-semester Break — Semester 1
2018-04-16 2018-06-03 7 Semester 1
2018-06-04 2018-06-08 1 Revision Period — Semester 1
2018-06-09 2018-06-24 1 Examination Period — Semester 1
2018-07-23 2018-09-23 1 Semester 2
2018-09-24 2018-09-30 1 Mid-semester Break — Semester 2
2018-10-02 2018-10-28 10 Semester 2
2018-10-29 2018-11-02 1 Revision Period — Semester 2
2018-11-03 2018-11-18 1 Examination Period — Semester 2
2019-02-25 2019-04-21 1 Semester 1
2019-04-22 2019-04-28 1 Mid-semester Break — Semester 1
2019-04-29 2019-06-02 9 Semester 1
2019-06-03 2019-06-07 1 Revision Period — Semester 1
2019-06-08 2019-06-23 1 Examination Period — Semester 1
2019-07-22 2019-09-29 1 Semester 2
2019-09-30 2019-10-06 1 Mid-semester Break — Semester 2
2019-10-08 2019-10-27 11 Semester 2
2019-10-28 2019-11-01 1 Revision Period — Semester 2
2019-11-02 2019-11-17 1 Examination Period — Semester 2`,
                    }
                },
                events: {
                    save: this.updateWeekDefinitions.bind(this),
                },
                css: `
                #BlackboardSearchConfig * { 
                    font-family: 'Segoe UI', 'Helvetica';
                }

                body#BlackboardSearchConfig  {
                    padding: 10px;
                }
                
                #BlackboardSearchConfig .config_var, #BlackboardSearchConfig .field_label {
                    font-size: 11pt;
                    height: 2em;
                }

                #BlackboardSearchConfig .config_var {
                    display: table;
                    width: 100%;
                    text-align: right;
                }

                #BlackboardSearchConfig .field_label {
                    display: table-cell;
                    width: 70%;
                    vertical-align: middle;
                    text-align: left;
                    font-weight: normal;
                }
                
                #BlackboardSearchConfig input[type="text"], #BlackboardSearchConfig textarea {
                    height: 2em;
                    width: 100%;
                    float: right;
                    padding-left: 2px;
                }

                #BlackboardSearchConfig textarea {
                    resize: vertical;
                }

                #BlackboardSearchConfig_resetLink {
                }

                #BlackboardSearchConfig button, #BlackboardSearchConfig .saveclose_buttons {
                    font-weight: normal;
                    font-size: 12pt;
                    border-width: 1px;
                    border-radius: 5px;
                    border-color: #272727;
                    border-style: solid;
                    padding: 3px 20px 3px 20px;
                    color: #272727;
                    background-color: transparent;
                    transition-property: background-color color;
                    transition-duration: 500ms;
                }

                button:focus {
                    outline: 0;
                }

                #BlackboardSearchConfig button:hover {
                    background-color: #272727;
                    color: white;
                }

                #BlackboardSearchConfig #BlackboardSearchConfig_closeBtn {
                    margin-right: 0px;
                }

                #BlackboardSearchConfig #BlackboardSearchConfig_WeekDefinitions_field_label {
                    vertical-align: top;
                    width: 30%;
                }

                #BlackboardSearchConfig #BlackboardSearchConfig_field_WeekDefinitions {
                    height: 9em;
                    font-family: monospace;
                }


                `
            });
            
            let courseData = JSON.parse(LZString.decompressFromUTF16(this.config.get('CourseDataLZ')));

            _.assign(this.courseDataObject, courseData);
            this.updateLinks();
            this.updateWeekDefinitions();
        }

        showConfig() {
            $.featherlight.current().close();
            this.config.open();
        }
    }

    console.log('Blackboard search starting.');
    //debugger;
    

    let courseIDRegex = /[?&]course_id=([^&?]+)/i;
    let match = courseIDRegex.exec(window.location.href);
    if (!match) return;

    let searchManager = new BlackboardSearchManager(match[1]);
    searchManager.maybeUpdateAllCourses()
    let searchWindow = searchManager.createWindow();
    
    const SPACE = ' '.charCodeAt(0);
    
    function keyboardShortcut(e) {
        if (e.ctrlKey && e.keyCode === SPACE) {
            if ($.featherlight.current()) return;
            $.featherlight($(searchWindow), {
                openSpeed: 50,
                closeSpeed: 200,
                persist: true,
                beforeOpen: function() {
                    searchManager.refreshTimeElements();
                    searchManager.doSearch(undefined, true);
                },
                afterOpen: function() {
                    let input = document.querySelector('#userscript-search-input');
                    input.focus();
                    input.select();
                    
                },
            });
        }
    }
    

    document.addEventListener('keydown', keyboardShortcut, false);

});

head.appendChild(link);

