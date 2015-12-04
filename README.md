# jira2slack
Slack Integration for Jira

## Project Purpose

There is not any perfect Jira integrations to slack . Current Official Integrations only pushes Jira events to single slack channel which is inconvenient to follow. 

We here aim a better solution. 

Jira has a well documented good solution called  [Jira WebHook] (https://developer.atlassian.com/static/connect/docs/latest/modules/common/webhook.html)  which triggers other application on Jira events .

We initially focus on the following two **Project events** and **Issue events** .

## Platform

Platform is [Nodejs] [https://nodejs.org/en/] with [Express](http://expressjs.com/)

## Implemetation

This software implements the following on Jira events.

**Project events**
*project_created* : When a Jira project is created, *jira2slack* creates a channel on Slack with a name project.key
*project_updated* : When there is a  update on Jira project , *jira2slack* creates a notification on channel with a name project.key
*project_deleted* : When the project is deleted on Jira, *jira2slack*  archives the related Slack channel and delete it. 

**Issue events**
*jira:issue_created* : When a Jira issue created , *jira2slack* initially checks if the Slack channel exists with a project.key of the issue, creates the channel if not exists and then invites creator and assignee of the issue to channel if they are not a memeber and then posts the related issue information issue_key, event_type, comment etc.
*jira:issue_deleted* : When a Jira issue is deleted, *jira2slack* sends a notification to related channel.
*jira:issue_updated* : When a Jira issue is updated, *jira2slack* sends a notification to related channel.
*jira:worklog_updated* : When a Jira issue is worklog updated, *jira2slack* sends a notification to related channel.