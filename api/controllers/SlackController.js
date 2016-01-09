/**
 * SlackController
 *
 * @description :: Server-side logic for converting Jira
 * events to Slack API calls.
 */
'use strict';

const apiToken = process.env.SLACK_TOKEN || sails.config.jira2slack.slackToken;
const Slack = require('slack-node');
const slack = new Slack(apiToken);
const accessToken = process.env.ACCESS_TOKEN || sails.config.jira2slack.accessToken;

let expirationTime = process.env.CACHE_EXPIRE || 15; /*default to 15 minutes*/
if (sails.config.jira2slack && sails.config.jira2slack.cacheExpire) {
  expirationTime = sails.config.jira2slack.cacheExpire;
}
expirationTime *= (expirationTime * 60000);

/* base URL for Jira tickets, grabbed from first ticket processed */
let baseUrl;

/* cache information about Slack channels */
let channelCache = new Map();

/* cache Slack users */
let userCache = {
  expiration: 0,
  cache: new Map()
};

function setError(error, res) {
  sails.log.error(error);
  res.send(500);
}

function sendSlackRequest(apiMethod, apiParameters) {
  return new Promise(function(resolve, reject) {
    sails.log.debug("apiMethod: " + apiMethod);
    sails.log.debug("apiParameters:\n" + JSON.stringify(apiParameters));
    slack.api(apiMethod, apiParameters,
      function(err, response) {
        sails.log.verbose('slack response:\n' + apiMethod + "\n" + JSON.stringify(response));
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {
          resolve(response);
        }
      });
  });
}

function loadUserCache() {
  return new Promise(function(resolve, reject) {
    if (new Date().getTime() > userCache.expiration) {
      sails.log.debug("user cache expired reloading");
      sendSlackRequest('users.list', null).
      then(response => {
        response.members.forEach(member => {
          if (member.profile.email) {
            userCache.cache[member.profile.email] = member.id;
          }
        });
        userCache.expiration = new Date().getTime() + Number(expirationTime);
        resolve();
      }).catch(error => reject(error));
    }
  });
}

function loadChannelCache() {
  return sendSlackRequest('channels.list', null).
  then(response => {
    response.channels.forEach(channel => {
      channelCache[channel.name] = {
        key: channel.name,
        id: channel.id,
        archived: channel.is_archived,
        purpose: channel.purpose.value,
        members: channel.members,
        expiration: new Date().getTime() + Number(expirationTime)
      };
    });
  });
}

function getChannelInfo(projectKey) {
  return new Promise(function(resolve, reject) {
    let channelInfo = channelCache[projectKey];
    if (channelInfo && (channelInfo.expiration > new Date().getTime())) {
      sails.log.debug("has cached channel info");
      resolve(channelInfo);
    } else if (channelInfo && (channelInfo.expiration < new Date().getTime())) {
      sails.log.debug("chanel cache expired, reloading");

      sendSlackRequest('channels.info', {
        channel: channelInfo.id
      }).then(response => {

        channelInfo = {
          key: projectKey,
          id: response.channel.id,
          archived: response.channel.is_archived,
          purpose: response.channel.purpose.value,
          members: response.channel.members,
          expiration: new Date().getTime() + expirationTime
        };

        channelCache[projectKey] = channelInfo;
        resolve(channelInfo);
      }).catch(error => reject(error));
    } else {
      /* reload cache */
      sails.log.debug("reloading channel cache");
      loadChannelCache().then(() => resolve(channelCache[projectKey])).catch(error => reject(error));
    }
  });
}

function createChannel(projectKey) {
  return new Promise(function(resolve, reject) {
    sendSlackRequest('channels.create', {
        name: projectKey
      })
      .then(response => {

        let channelInfo = {
          key: projectKey,
          id: response.channel.id,
          archived: false,
          purpose: ' ',
          members: response.channel.members,
          expiration: new Date().getTime() + expirationTime
        };

        channelCache[projectKey] = channelInfo;
        resolve(channelInfo);
      }).catch(error => reject(error));
  });
}

function unarchiveChannel(channelInfo) {
  return sendSlackRequest('channels.unarchive', {
    channel: channelInfo.id
  }).then(() => {
    channelCache[channelInfo.key].archived = false;
    channelInfo.archived = false;
  });
}

function joinChannel(channelInfo) {
  return sendSlackRequest('channels.join', {
    name: channelInfo.key
  });
}

function setChannelPurpose(channelInfo, purpose) {
  let setPurpose = channelInfo.purpose !== purpose;
  if (setPurpose) {
    return sendSlackRequest('channels.setPurpose', {
      channel: channelInfo.id,
      purpose: purpose
    }).then(() => {
      channelCache[channelInfo.key].purpose = purpose;
      channelInfo.purpose = purpose;
    });
  } else {
    return new Promise(resolve => resolve(channelInfo));
  }
}

function createOrUnarchiveChannel(projectKey, purpose) {
  return getChannelInfo(projectKey).then(function(channelInfo) {
    sails.log.debug("channel info: " + JSON.stringify(channelInfo));
    if (channelInfo && channelInfo !== null) {

      if (channelInfo.archived) {
        sails.log.debug("channel was archived, unarchiving");
        return unarchiveChannel(channelInfo)
          .then(() => joinChannel(channelInfo))
          .then(() => setChannelPurpose(channelInfo, purpose));
      } else {
        /* the channel name/purpose might have changed */
        return setChannelPurpose(channelInfo, purpose);
      }
    } else {
      return createChannel(projectKey)
        .then((channelInfo) => setChannelPurpose(channelInfo, purpose));
    }
  });
}

function inviteUsers(channelInfo, emails) {
  return loadUserCache().then(() => {
    let cache = userCache.cache;
    let slackMembers = emails.filter(email => email !== undefined)
      .filter(email => cache[email] !== undefined)
      .filter(email => channelInfo.members.findIndex(item => item === cache[email]) == -1)
      .map(email => cache[email]);

    let requests = slackMembers.map(id => {
      sails.log.debug(`inviting ${id} to channel: ${channelInfo.id}`);
      return sendSlackRequest('channels.invite', {
        channel: channelInfo.id,
        user: id
      }).then((response) => channelInfo.members = response.channel.members);
    });

    return Promise.all(requests);
  });
}

function projectCreated(message, res) {
  let projectKey = message.project.key.toLowerCase();
  let purpose = message.project.name;
  let projectLead = message.project.projectLead.emailAddress;
  createOrUnarchiveChannel(projectKey, purpose)
    .then(() => inviteUsers(channelCache[projectKey], [projectLead]))
    .then(() => res.ok()).catch(error => setError(error, res));
}

function projectUpdated(message, res) {
  let projectKey = message.project.key.toLowerCase();
  let purpose = message.project.name;
  /* this also updates the purpose if it is different */
  createOrUnarchiveChannel(projectKey, purpose).then(() => res.ok()).catch(error => setError(error, res));
}

function projectDeleted(message, res) {
  let projectKey = message.project.key.toLowerCase();
  getChannelInfo(projectKey).then(function(channelInfo) {
    if (channelInfo && !channelInfo.archived) {
      sendSlackRequest('channels.archive', {
        channel: channelInfo.id
      }).then(() => {
        channelCache[channelInfo.key].archived = true;
        res.ok();
      }).catch(error => setError(error));
    } else {
      sails.log.debug("channel is already archived or does not exist.");
    }
  });
}

function postMessage(projectKey, purpose, chatMessage, attachment, res) {
  return createOrUnarchiveChannel(projectKey, purpose)
    .then(() => {
      let channelInfo = channelCache[projectKey];
      return sendSlackRequest('chat.postMessage', {
        channel: channelInfo.id,
        text: chatMessage,
        attachments: attachment,
        username: 'Jira-Bot'
      });
    });
}

function issueCreated(message, res) {
  sails.log.debug('issue created');

  if (!baseUrl) {
    let pos = message.issue.self.indexOf('rest');
    baseUrl = message.issue.self.substring(0, pos);
    sails.log.debug("baseUrl: " + baseUrl);
  }

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.displayName;
  let userEmail = message.user.emailAddress;

  let issueKey = message.issue.key;
  let issueUrl = baseUrl + "browse/" + issueKey;
  let summary = message.issue.fields.summary;
  let issueType = message.issue.fields.issuetype.name;
  let priority = message.issue.fields.priority.name;

  let assignee = "Unassigned";
  let assigneeField = message.issue.fields.assignee;
  let assigneeEmail;
  if (assigneeField) {
    assignee = assigneeField.displayName;
    assigneeEmail = assigneeField.emailAddress;
  }

  let msg = `${user} created ${issueType} <${issueUrl}|${issueKey}>`;
  let attachment = `[{"color": "danger", "fields": [
{"title": "Summary", "value": "${summary}","short": false},
{"title": "Assingnee", "value": "${assignee }", "short": true},
{"title": "Priority", "value": "${priority}", "short": true}]}]`;
  let invites = [userEmail, assigneeEmail];
  postMessage(projectKey, projectName, msg, attachment, res).
  then(() => inviteUsers(channelCache[projectKey], invites))
    .then(() => res.ok()).catch(error => setError(error, res));
}

function issueUpdated(message, res) {
  sails.log.debug('issue updated');

  if (!baseUrl) {
    let pos = message.issue.self.indexOf('rest');
    baseUrl = message.issue.self.substring(0, pos);
    sails.log.debug("baseUrl: " + baseUrl);
  }

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.displayName;
  let userEmail = message.user.emailAddress;
  let creatorEmail, reporterEmail, assignee, assigneeEmail;

  let issueKey = message.issue.key;
  let issueUrl = baseUrl + "browse/" + issueKey;
  let summary = message.issue.fields.summary;
  let issueType = message.issue.fields.issuetype.name;

  let msg, invites;
  let attachment = '';

  let wasResolved = false;
  if (message.issue.fields.resolution && message.changelog.items.some(item => item.field === 'resolution')) {
    wasResolved = true;
  }

  if (message.issue.fields.assignee) {
    assignee = message.issue.fields.assignee.displayName;
    assigneeEmail = message.issue.fields.assignee.emailAddress;
  }

  if (message.comment && !wasResolved) { /* a comment was added */
    let comment = message.comment.body;
    msg = `${user} commented on ${issueKey} <${issueUrl}|${issueKey}>`;
    attachment = `[{"color": "warning", "fields": [
{"title": "Summary", "value": "${summary}","short": false},
{"title": "Comment", "value": "${comment }", "short": false}]}]`;
  } else if (message.changelog) {

    let reporterEmail;
    if (message.issue.fields.reporter) {
      reporterEmail = message.issue.fields.reporter.emailAddress;
    }

    /* issue was closed */
    if (wasResolved) {
      let creator = message.issue.fields.creator.displayName;
      creatorEmail = message.issue.fields.creator.emailAddress;
      let assignee = creator;
      if (!assignee) {
        assignee = creator;
      }

      msg = `${user} closed ${issueKey} <${issueUrl}|${issueKey}>`;
      let comment;
      if (message.comment) { /* do we have a comment on a close */
        comment = message.comment.body;
      }
      attachment = `[{"color": "good", "fields": [
{"title": "Summary", "value": "${summary}","short": false},
{"title": "Staus", "value": "${message.issue.fields.resolution.name}","short": false},
{"title": "Assignee", "value": "${assignee}","short": true},
{"title": "Creator", "value": "${creator}","short": true}`;
      if (comment) {
        attachment += `,{"title": "Comment", "value": "${comment }", "short": false}`;
      }

      attachment += `]}]`;
    } else {
      msg = `${user} updated ${issueKey} <${issueUrl}|${issueKey}>`;
      if (message.changelog.items) {
        attachment = `[{"color": "warning", "fields": [`;
        let item = message.changelog.items[0];
        let fromString = (item.fromString) ? item.fromString : "no value";
        attachment += `{"title": "Changed", "value": "${item.field} from: ${fromString} to: ${item.toString}","short": false}`;
        for (let i = 1; i < message.changelog.items.length; i++) {
          item = message.changelog.items[i];
          fromString = (item.fromString) ? item.fromString : "no value";
          attachment += `,{"title": "Changed", "value": "${item.field} from: ${item.fromString} to: ${item.toString}","short": false}`;
        }
        attachment += `]}]`;
      }
    }
  } else {
    /* excluding these, such as comment deletions */
    sails.log.debug(JSON.stringify(message, null, 2));
  }

  if (msg) {
    invites = [userEmail, assigneeEmail, creatorEmail, reporterEmail];
    postMessage(projectKey, projectName, msg, attachment, res).
    then(() => inviteUsers(channelCache[projectKey], invites))
      .then(() => res.ok()).catch(error => setError(error, res));
  } else {
    return res.ok();
  }
}

function issueDeleted(message, res) {
  sails.log.debug('issue deleted');

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.displayName;
  let issueKey = message.issue.key;
  let summary = message.issue.fields.summary;

  let msg = `${user} deleted ${issueKey}`;
  let attachment = `[{"color": "danger", "fields": [
{"title": "Summary", "value": "${summary}","short": false}]}]`;
  postMessage(projectKey, projectName, msg, attachment, res)
    .then(() => res.ok()).catch(error => setError(error, res));
}

function worklogUpdated(message, res) {
  let convertTime = time => {
    let totalMinutes = time / 60;
    let days = Math.floor(totalMinutes / 8 / 60);
    let hours = Math.floor((totalMinutes / 60) % 8);
    let minutes = totalMinutes % 60;
    let timeStr = days > 0 ? `${days}d` : '';
    if (hours) {
      timeStr += ` ${hours}h`;
    }
    if (minutes) {
      timeStr += ` ${minutes}m`;
    }
    return timeStr;
  };

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.displayName;
  let issueKey = message.issue.key;
  let summary = message.issue.fields.summary;
  let timeSpent;
  let timeEstimate;
  let timeAdded;
  if (message.changelog && message.changelog.items) {
    for (let i = 0; i < message.changelog.items.length; i++) {
      let item = message.changelog.items[i];
      switch (item.field) {
        case 'timeestimate':
          {
            timeEstimate = convertTime(Number(item.toString));
            break;
          }
        case 'timespent':
          {
            let totalTime = Number(item.toString);
            let delta = totalTime - Number(item.fromString);
            timeSpent = convertTime(totalTime);
            timeAdded = convertTime(delta);
            break;
          }
      }
    }
  }

  let msg = `${user} logged work on: ${issueKey}`;
  let attachment = `[{"color": "warning", "fields": [{"title": "Summary", "value": "${summary}","short": false}`;

  if (timeEstimate) {
    attachment += `,{"title": "Time Estimate", "value": "${timeEstimate}","short": false}`;
  }
  if (timeSpent) {
    attachment += `,{"title": "Time Logged", "value": "${timeAdded}","short": true}`;
    attachment += `,{"title": "Total Time Logged", "value": "${timeSpent}","short": true}`;
  }
  attachment += `]}]`;

  postMessage(projectKey, projectName, msg, attachment, res)
    .then(() => res.ok()).catch(error => setError(error, res));
}

/*run at startup*/
sails.log.debug("expirationTime: " + expirationTime);

Promise.all([loadChannelCache(), loadUserCache()]).catch(error => sails.log.error(error));

module.exports = {

  /**
   * `SlackController.process()`
   */
  process: function(req, res) {
    /* Verify access token */
    let token = req.param('token');
    if (accessToken !== token) {
      return res.send(401);
    }

    let message = req.body;
    sails.log.verbose(JSON.stringify(message));

    switch (message.webhookEvent) {
      case 'project_created':
        {
          projectCreated(message, res);
          break;
        }
      case 'project_updated':
        {
          projectUpdated(message, res);
          break;
        }
      case 'project_deleted':
        {
          projectDeleted(message, res);
          break;
        }
      case 'jira:issue_created':
        {
          issueCreated(message, res);
          break;
        }
      case 'jira:issue_updated':
        {
          issueUpdated(message, res);
          break;
        }
      case 'jira:issue_deleted':
        {
          issueDeleted(message, res);
          break;
        }
      case 'jira:worklog_updated':
        {
          worklogUpdated(message, res);
          break;
        }
      default:
        {
          return res.send(501);
        }
    }
  }
};