/**
 * SlackController
 *
 * @description :: Server-side logic for converting Jira
 * events to Slack API calls.
 */
'use strict';

var apiToken = process.env.SLACK_TOKEN || sails.config.jira2slack.slackToken;
var Slack = require('slack-node');
var slack = new Slack(apiToken);
var accessToken = process.env.ACCESS_TOKEN || sails.config.jira2slack.accessToken;
var expirationTime = process.env.CACHE_EXPIRE || 15; /*default to 15 minutes*/
if (sails.config.jira2slack && sails.config.jira2slack.cacheExpire) {
  expirationTime = sails.config.jira2slack.cacheExpire;
}

/* base URL for Jira tickets, grabbed from first ticket processed */
var baseUrl;

/* cache information about Slack channels */
var channelCache = new Map();

function setError(error, res) {
  sails.log.error(error);
  res.send(500);
}

function loadChannelCache() {
  return new Promise(function(resolve, reject) {
    slack.api('channels.list', function(err, response) {
      if (err || !response.ok) {
        reject((!response.ok) ? response.error : err);
      } else {
        channelCache.clear();
        for (let i = 0; i < response.channels.length; i++) {
          let channel = response.channels[i];
          channelCache[channel.name] = {
            key: channel.name,
            id: channel.id,
            archived: channel.is_archived,
            purpose: channel.purpose,
            expiration: new Date().getTime() + expirationTime
          };
        }
        resolve();
      }
    });
  });
}

function getChannelInfo(projectKey) {
  return new Promise(function(resolve, reject) {
    let channelInfo = channelCache[projectKey];

    if (channelInfo && (channelInfo.expiration > new Date().getTime())) {
      sails.log.debug("has cached info");
      resolve(channelInfo);
    } else if (channelInfo && (channelInfo.expiration < new Date().getTime())) {
      sails.log.debug("cache expired");
      slack.api('channels.info', {
        channel: channelInfo.id
      }, function(err, response) {
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {

          channelInfo = {
            key: projectKey,
            id: response.channel.id,
            archived: response.channel.is_archived,
            purpose: response.channel.purpose.value,
            expiration: new Date().getTime() + expirationTime
          };
          channelCache[projectKey] = channelInfo;
          resolve(channelInfo);
        }
      });
    } else {
      /* reload cache */
      sails.log.debug("reloading full cache");
      loadChannelCache().then(() => resolve(channelCache[projectKey])).catch(error => reject(error));
    }
  });
}

function createChannel(projectKey) {
  return new Promise(function(resolve, reject) {
    sails.log.debug("creating channel:" + projectKey);
    slack.api('channels.create', {
        name: projectKey
      },
      function(err, response) {
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {

          let channelInfo = {
            key: projectKey,
            id: response.channel.id,
            archived: false,
            purpose: ' ',
            expiration: new Date().getTime() + expirationTime
          };

          channelCache[projectKey] = channelInfo;
          resolve(channelInfo);
        }
      });
  });
}

function joinChannel(channelInfo) {
  return new Promise(function(resolve, reject) {
    slack.api('channels.create', {
        channel: channelInfo.key
      },
      function(err, response) {
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {
          resolve(channelInfo);
        }
      });
  });
}

function unarchiveChannel(channelInfo) {
  return new Promise(function(resolve, reject) {
    slack.api('channels.unarchive', {
        channel: channelInfo.id
      },
      function(err, response) {
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {
          channelCache[channelInfo.key].archived = false;
          channelInfo.archived = false;
          resolve(channelInfo);
        }
      });
  });
}

function setChannelPurpose(channelInfo, purpose) {
  return new Promise(function(resolve, reject) {
    let setPurpose = channelInfo.purpose !== purpose;
    sails.log(setPurpose);

    if (setPurpose) {
      sails.log.debug("setting channel purpose: " + purpose);
      slack.api('channels.setPurpose', {
          channel: channelInfo.id,
          purpose: purpose
        },
        function(err, response) {
          if (err || !response.ok) {
            reject((!response.ok) ? response.error : err);
          } else {
            channelCache[channelInfo.key].purpose = purpose;
            channelInfo.purpose = purpose;
            resolve(channelInfo);
          }
        });
    } else {
      resolve(channelInfo);
    }
  });
}

function createOrUnarchiveChannel(projectKey, purpose) {
  return new Promise(function(resolve, reject) {
    getChannelInfo(projectKey).then(function(channelInfo) {
      if (channelInfo && channelInfo !== null) {

        if (channelInfo.archived) {
          sails.log.debug("channel was archived, unarchiving");
          unarchiveChannel(channelInfo)
            .then(joinChannel(channelInfo))
            .then(setChannelPurpose(channelInfo, purpose)).then(() => resolve(channelInfo)).catch(error => reject(error));
        } else {
          /* the channel name/purpose might have changed */
          setChannelPurpose(channelInfo, purpose).then(() => resolve(channelInfo)).catch(error => reject(error));
        }
      } else {
        createChannel(projectKey)
          .then(
            info => {
              return setChannelPurpose(info, purpose);
            })
          .then(info => resolve(info)).catch(error => reject(error));
      }
    });
  });
}

function projectCreated(message, res) {
  let projectKey = message.project.key.toLowerCase();
  let purpose = message.project.name;
  createOrUnarchiveChannel(projectKey, purpose).then(() => res.ok()).catch(error => setError(error, res));
}

function projectUpdated(message, res) {
  let projectKey = message.project.key.toLowerCase();
  let purpose = message.project.name;
  /* this also updated the purpose if it is different */
  createOrUnarchiveChannel(projectKey, purpose).then(() => res.ok()).catch(error => setError(error, res));
}

function projectDeleted(message, res) {
  let projectKey = message.project.key.toLowerCase();
  getChannelInfo(projectKey).then(function(channelInfo) {
    if (channelInfo && !channelInfo.archived) {
      sails.log.debug("archiving " + projectKey);
      slack.api('channels.archive', {
          channel: channelInfo.id
        },
        function(err, response) {
          if (err || !response.ok) {
            setError(((!response.ok) ? response.error : err), res);
          } else {
            res.ok();
          }
        });
    }
  });
}

function sendMessageSlack(channelInfo, message) {
  return new Promise(function(resolve, reject) {
    sails.log.debug("posting message to: " + channelInfo.id);
    sails.log.debug(message);
    slack.api('chat.postMessage', {
        channel: channelInfo.id,
        text: message,
        username: 'Jira-Bot'
      },
      function(err, response) {
        if (err || !response.ok) {
          reject((!response.ok) ? response.error : err);
        } else {
          channelInfo.archived = false;
          resolve(channelInfo);
        }
      });
  });
}

function sendMessage(projectKey, purpose, chatMessage) {
  return new Promise(function(resolve, reject) {
    createOrUnarchiveChannel(projectKey, purpose)
      .then(info =>
        sendMessageSlack(info, chatMessage)
      ).then(info => resolve(info)).catch(error => reject(error));
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
  let user = message.user.name;
  let issueKey = message.issue.key;
  let issueUrl = baseUrl + "browse/" + issueKey;
  let summary = message.issue.fields.summary;
  let issueType = message.issue.fields.issuetype.name;
  let priority = message.issue.fields.priority.name;
  let assignee = message.issue.fields.assignee;

  let msg = `${user} created ${issueType}: ${issueKey}, priority: ${priority}`;
  if (assignee) {
    msg += `, assgined to: ${assignee.name}`;
  }
  msg += `
  ${summary}
  ${issueUrl}`;
  sendMessage(projectKey, projectName, msg).then(() => res.ok()).catch(error => setError(error, res));
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
  let user = message.user.name;
  let issueKey = message.issue.key;
  let issueUrl = baseUrl + "browse/" + issueKey;
  let summary = message.issue.fields.summary;
  let issueType = message.issue.fields.issuetype.name;

  let msg = '';
  if (message.comment) {
    let comment = message.comment.body;
    msg = `${user} commented on ${issueKey} - ${summary}
${issueUrl}
${comment}`;
  } else if (message.changelog) {
    msg = `${user} updated ${issueKey} - ${summary}
${issueUrl}`;
    if (message.changelog.items) {
      for (let i = 0; i < message.changelog.items.length; i++) {
        let item = message.changelog.items[i];
        msg += `
${item.field} to: ${item.toString}`;
      }
    }
  } else {
    /* excluding these, such as comment deletions */
    sails.log.debug(JSON.stringify(message, null, 2));
  }

  sendMessage(projectKey, projectName, msg).then(() => res.ok()).catch(error => setError(error, res));
}

function issueDeleted(message, res) {
  sails.log.debug('issue deleted');

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.name;
  let issueKey = message.issue.key;
  let summary = message.issue.fields.summary;

  let msg = `${user} deleted: ${issueKey} - ${summary}`;
  sendMessage(projectKey, projectName, msg).then(() => res.ok()).catch(error => setError(error, res));
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

  sails.log.debug('worklog updated');

  let projectKey = message.issue.fields.project.key.toLowerCase();
  let projectName = message.issue.fields.project.name;
  let user = message.user.name;
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

  let msg = `${user} logged work on: ${issueKey} - ${summary}`;
  if (timeEstimate) {
    msg += `
time estimate: ${timeEstimate}`;
  }
  if (timeSpent) {
    msg += `
time logged : ${timeAdded}
total time : ${timeSpent}`;
  }

  sendMessage(projectKey, projectName, msg).then(() => res.ok()).catch(error => setError(error, res));
}

/*run at startup*/
sails.log.debug("expirationTime: " + expirationTime);
loadChannelCache().catch(error => {
  throw "unable to load channels = " + error;
});


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