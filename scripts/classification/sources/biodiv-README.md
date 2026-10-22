# BioDiv-3DTrees Dataset Overview
This dataset contains species-labeled multi-sensor LiDAR data from 4,952 single trees in the Forest Gap Experiment (FOX) of the Biodiversity Exploratories. Quantitative Structure Models (QSMs) were derived for 3,386 deciduous trees of the dataset using TreeQSM and Terrestrial Laser Scanning (TLS) data. QSMs were not generated for coniferous trees.
In addition to TLS and QSMs, Unmanned Aerial Laser Scanning (ULS) data and the graph representation of the QSM models is provided for every broadleafed tree.
The dataset is organized into several directories, each containing specific types of data files. 
For benchmarking purposes, the dataset was split into training, validation and test sets using an 80/10/10 split and stratification by tree species. This split can be derived from the column *split* of the `labels.csv` file.

## Directory Structure

### TLS Directory

The `TLS` directory contains the TLS data of the 4,952 single tree point clouds as `.laz`.

### ULS Directory

The `ULS` directory contains the ULS data of the 4,952 single tree point clouds as `.laz`.

### QSM Directory

The `QSM` directory contains the 3,386 QSM reconstructions in two versions, each in its own directory:

- `all`: Contains the TreeQSM (Version 2.4.1) output of all derived QSM models for each tree befor selecting the 'optimal' model. The data is provided as .mat-files.
- `raw`: Contains the selected optimal model as classified by TreeQSM function select_optimum() as .mat-files.
- `corrected`: Contains the allometrically corrected TreeQSM reconstructions using the R package 'rTwig' version 1.4.0 as csv-files. 

### Graph Directory

The `Graph` directory contains the 3,386 graph representations of the underlying QSM reconstructions of this dataset. 

### QSM column description

The column description was taken from the official documentation of rTwig for v1.4.0 (https://github.com/aidanmorales/rTwig/blob/main/vignettes/Dictionary.Rmd).

#### Cylinder Attributes

**`start:`** This defines the x, y, z coordinates at the center of the cylinder's base.

**`axis:`** This defines the x, y, z axis formed between the cylinder's base and top.

**`end:`** This defines the x, y, z coordinates at the center of the cylinder's top.

**`id:`** The first cylinder id is 1 and is the base of the tree. The largest id value is equal to the number of rows in the data frame.

**`parent:`** This shows the relationships between individual cylinders in the QSM. The parent of the first cylinder is always zero, because the base of the tree has no parent. Within a branch, parent cylinders are always one less than their child. At the base of a branch, the parent cylinder is the cylinder the branch is connected to.

**`radius:`** This is the radius of the cylinder in meters.

**`raw_radius:`** This is the radius of the cylinder before any possible modifications. If using TreeQSM, this is always the *UnmodRadius* column. If using SimpleForest or Treegraph, this is a copy of the radius before Real Twig is run. Real Twig always uses this radius in its corrections.

**`modified:`** This is an average index of if the cylinder radius was an outlier and modified with Real Twig across the QSM paths. A value of 0 indicates that the cylinder was never modified in any path, while a value of 1 indicates that it was modified in every path. A value in between 0 and 1 was modified in only some, but not all of the paths.

**`length:`** This is the length of the cylinder in meters.

#### Branch Attributes

**`branch:`** A branch is defined as starting at a new branch order and continuing until a twig is reached. This definition is what TreeQSM and Treegraph use. SimpleForest branches are converted to this definition when standardizing the QSM. The first branch is always the main stem under the rTwig format. Treegraph QSMs retain their definition of branches. TreeQSM and SimpleForest are numbered consecutively in order of the cylinder ids.

**`branch_position:`** This is an index of the cylinder's position within a branch. This is the same as TreeQSM's *PositionInBranch* definition. The first position is always the base of the branch, and the last position is always a twig or the branch end in the case of a broken branch.

**`branch_order:`** This is the order of every branch. The smallest branch order zero is always the main stem. First order branches are connected to the main stem, and so on a so forth for higher order branches. A new branch order always begins at a new branching fork, continues to a twig or end of a broken branch, and is one greater than the parent order. This definition is consistent between TreeQSM, SimpleForest, and Treegraph, but the rTwig format always defines the main stem as order zero for consistency.

**`reverse_order:`** This is the reverse branch order (RBO). Traditional branch ordering is relative to the main stem, and does not tell us anything about the position or size of the branch. Small twigs and large branches can both be first order branches if they are connected to the main stem under the traditional definition. RBO solves this problem by considering the relative position of branches within a QSM. RBO assigns a value of one at the end of twigs or broken branches, and works backwards until the base of the tree is reached, which is assigned the highest RBO. The RBO of any branch is the maximum segment (internode) depth relative to the twigs in a tree.

**`branch_alt:`** This is the alternate branch index. Alternate branch zero is always the main stem. The rest of the branches are first order branches and all of their children. This is similar to cutting the first order branches off with a saw and labeling them consecutively. If using a SimpleForest QSM, this is the old `branchID` column updated so that the main stem is index zero.

#### Segment Attributes

**`segment:`** A segment (internode) is a portion of a tree between branching forks (nodes). A new segment begins at every branch fork. Cylinders are a part of a segment until the cylinder has more than one child and a new segment is created. The rTwig format always defines the base of the tree as the first segment.

**`parent_segment:`** This shows the relationships between segments in the QSM. The parent segment of the first segment is always zero, because the first segment (the base of the tree) has no parent segment. The parent segment is the node the current segment forked from.

**`total_children:`** This is the total number of cylinders supported by the given cylinder. This is useful to find where branches fork. A value of one means that there are no branching forks. A value of two means that there is one branching fork, etc.

#### Additional Metrics

**`growth_length:`** This is the growth length in meters of any given cylinder. Growth length can be defined as the sum of the lengths of the cylinders supported by the given cylinder. We can visualize growth length by cutting a tree with a saw at any given point. The cumulative length of this cut portion is the growth length where the part of the tree was cut. The growth length of the base of the tree is the sum of the lengths of all the cylinders in the QSM. The growth length of a twig is simply the length of its cylinder. Growth length reflects a measurement that could be taken on a real tree, but is easier to obtain with QSMs.

**`base_distance:`** This is the distance in meters of any given cylinder from the base of the tree. This distance is calculated by taking the simplest complete path from the given cylinder to the base of the tree.

**`twig_distance:`** This is the average distance in meters a given cylinder is away from all supported twigs. This is calculated by finding all complete simple paths from the given cylinder to the supported twigs, summing the lengths, and then dividing by the number of paths.

**`vessel_volume:`** This is the theoretical cumulative volume of living vessels supported by a given cylinder based on allometric scaling theory. It is the sum of *pipe_area \* length* for all supported cylinders.

**`pipe_area:`** This is the theoretical cross-sectional area of a given cylinder based on allometric scaling theory. The units and values are the total number of supported twigs.

**`pipe_radius:`** This is the theoretical radius of a given cylinder based on allometric scaling theory. The units and values are the square root of the total number of supported twigs.

### Labels

The `labels.csv` file contains species labels, single tree variables derived from TLS and ULS point clouds as well as validation flags of the QSM models. 
The columns in this file include:

- `treeID`: Unique identifier for each tree.
- `ep`: Experimental Plot identifier.
- `gap`: Forest Gap Experiment (FOX) subplot identifier.
- `tlsID`: TLS scan identifier.
- `foxID`: Fox identifier.
- `FOXTreeID`: Offical FOX tree ID also found in other data sets.
- `species`: Species of the tree.
- `type`: Species type of the tree. Either 'broadleaf' or 'conifer'.
- `matchDist`: Distance of the point cloud in meters to the matched forest inventory entry.
- `type`: Type of tree (e.g., coniferous, deciduous).
- `dTLS`: Diameter at breast (DBH) height derived from the TLS point clouds.
- `dResTls`: Mean square error derived from the residuals of the DBH fit.
- `hTLS`: Tree height derived from the TLS point clouds.
- `cpaTLS`: Crown projection area derived from the TLS point clouds.
- `hULS`: Tree height derived from the ULS point clouds.
- `nULS`: Number of points in the ULS point cloud.
- `selected4QSM`: Whether selected for QSM or not.
- `QSMsuccess`: QSM success flag.
- `validDBH`: QSM passed diameter at breast height validation.
- `validH`: QSM passed tree height validation.
- `validCPA`: QSM passed crown projection area validation.
- `validQSM`: QSM passed all validation steps.
- `split`: Predefined Training, Validation and Test split (80/10/10, stratified by species) for benchmarking purposes.
- `volQSM`: Tree volume in m³ based on the derived QSM.


## File Naming Convention

The file names are created using '_' as a separator and include the following components:

1. The ID of the corresponding Experimental Plot (EP).
2. The subplot ID of the corresponding Forest Gap Experiment (FOX) plots.
3. The number of the tree on the subplot.
4. The type of the data.

For example, in the file `AEW03_G_101_TLS.laz`:
- `AEW03` is the Experimental Plot ID.
- `G` is the subplot ID.
- `101` is the tree number on the subplot.
- `TLS` indicates the type of data.

The combination of the first three components (`AEW03_G_101`) creates the unique `treeID` identifier found in `labels.csv`.

## License

CC BY 4.0
Creative Commons Attribution 4.0 International 

## Contact

For any questions or further information, please contact nils.griese@uni-goettingen.de.
