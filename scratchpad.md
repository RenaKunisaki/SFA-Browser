loading wrong ISO file isn't handled nicely

should replace various instances of Error with custom objects so they can be caught

this whole patcher thing is a bit nuts
I can't keep track of how all this shit works
there are different ways to do the job

probably we should just release a patch like we have before
this online patcher isn't needed really
but I do want to make it eventually, so how?

# just apply an xdelta patch
- easy
- no flexibility

# replace files in the ISO
- fairly easy, we already have code for it
- somewhat flexible
- requires premade archives for different options

# rebuild the archives
- difficult
- most flexible


anyway right now we should play test in Dolphin and on console (not Wii mode) but Dolphin doesn't like this PC in debug mode
