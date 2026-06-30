# Classroom 50 Web - Student Guide

Visit [classroom50.org](https://www.classroom50.org) to access the web interface.

# Introduction

This guide describes how to use Classroom 50 via its web interface at [classroom50.org](https://www.classroom50.org). Classroom 50 is also available as a [command-line tool](/CLI-Student-Guide.md).

This guide will cover the following topics, roughly in the order a student is likely to encounter them when managing a class with Classroom 50:

- [GitHub Setup](#github-setup)
- [Joining Your Class](#joining-your-class)
- [Logging Into Classroom 50](#logging-into-classroom-50)
- [Viewing Organizations](#viewing-organizations)
- [Accepting Assignments](#accepting-assignments)
- [Submitting Assignments](#submitting-assignments)

> As you use Classroom 50, if you have feature requests, discover bugs, or would like to suggest ideas for improvements, please reach out to us in our [discussion forums](https://github.com/foundation50/classroom50/discussions); we look forward to hearing from you!

# GitHub Setup

Classroom 50 is built entirely atop GitHub's existing infrastructure; as a result, in order to use Classroom 50 for your classes and assignments, [you will need a GitHub account first](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github). 

# Joining Your Class

Before you can view and accept assignments for your class, you will need to be invited to the [organization](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations) to which your class belongs. This is normally a detail your teacher or school will take care of for you; however, you will want to ensure they [send you an invitation](https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization), a detail discussed in the [Teacher's Guide](Web-Teacher-Guide.md) for Classroom 50. You will then want to accept this invitation before proceeding to logging into Classroom 50 below.

# Logging into Classroom 50

![Classroom 50 Login Screen](images/web_login_screen.png)

When visiting [https://classroom50.org](https://classroom50.org), you'll be prompted with a login screen.

Classroom 50 uses your GitHub credentials to establish a connection to GitHub using [OAuth 2](https://oauth.net/2/). You have two options for how to sign in:

- **Sign in with GitHub**: This is a standard OAuth flow that will use your web browser to ask GitHub for permission to perform tasks on your behalf and then redirect back to the Classroom 50 app.
- **Use a device code instead**: This is a more manual process that can act as a fallback; it requires you to copy and paste an authentication code into a page on GitHub's website that then triggers a similar OAuth permissions authorization. Once complete, Classroom 50 will poll to verify that it's been completed.

When authorizing with GitHub, ensure that any organizations you would like to use with Classroom 50 are given permission here. If you are the organization owner, you can allow access to the organization as part of the confirmation on GitHub's OAuth login screen; if you are not the organization owner, you may need to "Request" access and then have an owner grant access through the organization's OAuth settings. As a student, you will likely not have to worry about this detail, as the teacher setting up Classroom 50 will likely have already granted Classroom 50 permission when setting things up beforehand.

![Picture of Classroom 50 login flow](images/web_login_flow.png)

# Viewing Organizations

![Organizations view of Classroom 50](images/web_organizations.png)

After logging in, you'll see a list of organizations you can use with Classroom 50. An organization can be in one of the following states:

- **Ready**: The organization is configured to use with Classroom 50. An "Open" button is available to access the classroom.
- **Needs service token**: The organization needs a service token to be configured by clicking "Complete Setup" for score collection to work correctly.
- **Uninitialized**: The organization shows up in the "Set Up New Classroom 50 Organization" section and can be used to begin Classroom 50 setup.

As a student, you will be mostly be concerned with organizations that are in the **Ready** state; 

# Logging Into Classroom 50

# Viewing Organizations

# Accepting Assignments

# Submitting Assignments
