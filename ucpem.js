/// <reference path="./.vscode/config.d.ts" />

const { project, github } = require("ucpem")

project.prefix("src").res("virtualNetwork",
    github("bt7s7k7/EventLib").res("eventLib"),
    github("bt7s7k7/CommonTypes").res("registry"),
    github("bt7s7k7/CommonTypes").res("comTypes"),

)