﻿/// <reference path="bower_components/dt-angular/angular.d.ts"/>
/// <reference path="google-diff-match-patch.d.ts"/>

module AngularRichTextDiff {
    'use strict';

    interface IRichTextDiffScope extends ng.IScope {
        left: string;
        right: string;
        diffOutput: string;
    }

    interface ITagMapping {
        tag: string;
        unicodeReplacement: string;
    }

    class RichTextDiffController {

        static $inject = ['$scope', '$sce'];

        unicodeRangeStart = 0xE000;
        tagMap: any;
        dmp: diff_match_patch;

        constructor(public $scope: IRichTextDiffScope, public $sce: ng.ISCEService) {
            $scope.$watch('left', () => { this.doDiff(); });
            $scope.$watch('right', () => { this.doDiff(); });
            this.tagMap = {};
            this.dmp = new diff_match_patch();
            this.doDiff();
        }

        doDiff(): void {
            var diffableLeft = this.convertHtmlToDiffableString(this.$scope.left);
            var diffableRight = this.convertHtmlToDiffableString(this.$scope.right);
            var diffs = this.dmp.diff_main(diffableLeft, diffableRight);
            this.dmp.diff_cleanupSemantic(diffs);
            var diffOutput = '';
            for (var x = 0; x < diffs.length; x++) {
                diffs[x][1] = this.insertTagsForOperation(diffs[x][1], diffs[x][0]);
                diffOutput += this.convertDiffableBackToHtml(diffs[x][1]);
            }

            this.$scope.diffOutput = this.$sce.trustAsHtml(diffOutput);
        }

        insertTagsForOperation(diffableString: string, operation: number): string {
            var openTag = '';
            var closeTag = '';
            if (operation === 1) {
                openTag = '<ins>';
                closeTag = '</ins>';
            } else if (operation === -1) {
                openTag = '<del>';
                closeTag = '</del>';
            } else {
                return diffableString;
            }

            var outputString = openTag;
            var isOpen = true;
            for (var x = 0; x < diffableString.length; x++) {
                if (diffableString.charCodeAt(x) < this.unicodeRangeStart) {
                    // We just hit a regular character. If tag is not open, open it.
                    if (!isOpen) {
                        outputString += openTag;
                        isOpen = true;
                    }

                    outputString += diffableString[x];
                } else {
                    // We just hit one of our mapped unicode characters. Close our tag.
                    if (isOpen) {
                        outputString += closeTag;
                        isOpen = false;
                    }

                    outputString += diffableString[x];
                }
            }

            if (isOpen) outputString += closeTag;

            return outputString;
        }

        convertHtmlToDiffableString(htmlString: string): string {
            var diffableString = '';

            var offset = 0;
            while (offset < htmlString.length) {
                var tagStart = htmlString.indexOf('<', offset);
                if (tagStart < 0) {
                    diffableString += htmlString.substr(offset);
                    break;
                } else {
                    var tagEnd = htmlString.indexOf('>', tagStart);
                    if (tagEnd < 0) {
                        // Invalid HTML
                        // Truncate at the start of the tag
                        console.log('Invalid HTML. String will be truncated.');
                        diffableString += htmlString.substr(offset, tagStart - offset);
                        break;
                    }

                    var tagString = htmlString.substr(tagStart, tagEnd + 1 - tagStart);

                    // Is this tag already mapped?
                    var unicodeCharacter = this.tagMap[tagString];
                    if (unicodeCharacter === undefined) {
                        // Nope, need to map it
                        unicodeCharacter = String.fromCharCode(this.unicodeRangeStart + this.tagMap.length);
                        this.tagMap[tagString] = unicodeCharacter;
                        this.tagMap[unicodeCharacter] = tagString;
                    }

                    // At this point it has been mapped, so now we can use it
                    diffableString += htmlString.substr(offset, tagStart - offset);
                    diffableString += unicodeCharacter;

                    offset = tagEnd + 1;
                }
            }

            return diffableString;
        }

        convertDiffableBackToHtml(diffableString: string): string {
            var htmlString = '';

            for (var x = 0; x < diffableString.length; x++) {
                var charCode = diffableString.charCodeAt(x);
                if (charCode < this.unicodeRangeStart) {
                    htmlString += diffableString[x];
                    continue;
                }

                var tagString = this.tagMap[diffableString[x]];
                if (tagString === undefined) {
                    // We somehow have a character that is above our range but didn't map
                    // Do we need to add an upper bound or change the range?
                    htmlString += diffableString[x];
                } else {
                    htmlString += tagString;
                }
            }

            return htmlString;
        }
    }

    function richTextDiff(): ng.IDirective {
        var directive = <ng.IDirective> {
            restrict: 'E',
            scope: {
                left: '=left',
                right: '=right'
            },
            template: '<div ng-bind-html="diffOutput"></div>',
            controller: RichTextDiffController
        };

        return directive;
    }

    angular.module('angular-rich-text-diff', ['ngSanitize']);

    angular
        .module('angular-rich-text-diff')
        .directive('richTextDiff', richTextDiff);
}