# jira2slack
Slack Integration for Jira

## Project Purpose

There is not any perfect Jira integrations to slack . Current Official Integrations only pushes Jira events to single slack channel which is inconvenient to follow. 

We here aim a better solution. 

Jira has a well documented good solution called  [Jira WebHook] [https://developer.atlassian.com/static/connect/docs/latest/modules/common/webhook.html]  which triggers other application on Jira events .

We initially focus on the following two **Project events** and **Issue events** .

## Platform

Platform is [Nodejs] [https://nodejs.org/en/] with [Express][http://expressjs.com/]

