# Ultravisor

Like a supervisor, only instead of super it's ULTRA.  The hidden sixth hero of
Voltron.  This tool allows you to run commands on schedule and process output
with llm models, providing user-friendly summaries and links back to the full
complete output from command running.

## Use Cases

* Periodic data pull from a REST API with localized storage
* Data integrations between one system and another
* Automatic execution of image generation models with randomized word choices
* Parsing of massive sets of files for meaning leveraging ai

## Primary Concepts

Ultravisor operates on a few key concepts:

* operation - one or many tasks that run in sequence and/or parallel
* task - this is the verb... "what to do"
* node - a specific executing ultravisor (often just one, but can be a cluster)
* global state - data shared across all tasks
* node state - data accessible locally only (when running with node affinity)
* metaoutput - the output from tasks and operations
* operation staging - temporary data from an operation
* output file store - final file output from an operation
* output data store - flexible database of final outputs from operations

### Operations

An operation is, generally speaking, a set of tasks.  Tasks can be composed to
react to certain data/state situations.  With clever use of global state, they
can even perform complicated series of actions across operations.

For instance, I could have one operation that runs a number of tasks on a
schedule to pull temperature from various locations in my house.  Each task
can store the values in some kind of API, and, keep track of the latest value
as well as timestamp in global state.  These tasks might run every 5-10 seconds
or so; where they store the data may be 

Then, a second operation could be running every minute that inspects the global
state and adjusts a localized thermostat based on the current temperatures.

Or maybe I have a NAS full of video files that I would like to run a series of
machine learning algorithms on, to generate metadata on when scene cuts were
made in each film.  I could setup an operation with a task to watch the cpu,
iops and memory load of a machine and run parallel tasks that saturate the
iops/cpu on the machine.  This would be a scheduled, parameterized parallel set
of tasks.

### Tasks

Tasks can be really any program that is executable from a local shell, or,
within a browser environment.  The browser part is especially interesting
since you can basically script sets of actions within web pages (e.g.
downloading all the files listed on a page... and/or enumerating all the pages
and running the recursive download task for each page).

Tasks can be executed based on a number of scenarios:

* On a schedule (5pm every day, every 5 minutes, up to 5 times a minute)
* After a condition is met (a condition in a browser, a disk drops below 5g)
* After another task is completed (ffmpeg returns successfully transcoding)

### Nodes

Any execution of Ultravisor.  Can be distributed across multiple machines.

When run with multiple nodes, there is a star topology with the capability for
nodes to self promote to be the central node if the central node goes away.

### Global State

Global state is simple/plain JSON object that's synchronized across nodes.  It
is meant to be used to store small facts and not process management state (e.g.
it isn't an appropriate storage location for a mutex lock but is great for the
most recent temperature readings from a set of sensors).

### Node State

Node state is similar to global state, but is only accessible to the local node
the task is running on.  This is useful for storing configuration, paths or
other node-specific information.

### Metaoutput

Metaoutput is the output from running tasks and operations.  It is stored in a
simple JSON manifest including consistent fields for understanding:

* Summary of Output
* Start Time, Stop Time, Status, Success/Failure for the Operation
* Start Time, Stop Time, Status, Success/Failure for each Task
* Output Data (text, json, binary, files, etc.)
* Run Log(s) for Tasks
* Links to Output
* Anything Else the Task/Operation Wants to Report

### Operation Staging

Operation staging is temporary storage for data during the execution of an
operation.  This is useful for storing intermediate files, logs, or other data
that is not needed after the operation completes.

Operations can be flagged to have node affinity, or not.  If affinity is set,
all tasks for the operation will run on the same node, allowing for enormous
local file stores for the operation itself.  This is great for Machine Learning
operations that need to store large source files, intermediate learning data
and final output files.

### Output File Store

The centralized location for all final output files from operations.  This is
meant to be a persistent storage location that is accessible across nodes.

### Output Data Store

The output data store is a flexible database for storing final output data from
operations.  This can be used to store structured data, metadata, or any other
information that needs to be queried or analyzed later.
