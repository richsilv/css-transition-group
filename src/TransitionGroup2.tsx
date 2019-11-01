import * as React from "react";

// An empty array to return for referential equality
const EMPTY_ARRAY = [];

interface IElementWithIndex {
  readonly element: React.ReactElement;
  readonly index: number;
}

// Compare two lists of ReactElements by key
function elementDiff(
  comparedItems: Array<React.ReactElement>,
  compareWith: Array<React.ReactElement>
): Array<IElementWithIndex> {
  const compareWithKeys = new Set(compareWith.map(element => element.key));
  const diff = comparedItems
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => !compareWithKeys.has(element.key));
  return diff.length ? diff : EMPTY_ARRAY;
}

// Map either a single React Element or an array to a new array of React Elements
function toArray(elements: React.ReactElement | Array<React.ReactElement>) {
  return elements instanceof Array
    ? elements.length
      ? [...elements]
      : EMPTY_ARRAY
    : [elements];
}

// Add any newly removed children to the `leavingChildren` array.
// We need to update the newly leaving children (which will have indices related to their last position in the component's children)
// so that their indices reflect any *already* leaving children, which are no longer in the `children` array, but will still be
// rendered until they've been removed from `leavingChildren`.
function mergeInRemovedChildren(
  removedChildren: Array<IElementWithIndex>,
  leavingChildren: Array<IElementWithIndex>
) {
  return [...leavingChildren]
    .concat(
      removedChildren.map(({ element, index }) => {
        let indexPush = 0;
        leavingChildren.forEach(({ index: leavingChildIndex }) => {
          if (leavingChildIndex <= index + indexPush) {
            indexPush++;
          }
        });
        return { element, index: index + indexPush };
      })
    )
    .sort(({ index: indexA }, { index: indexB }) => indexA - indexB);
}

function cloneWithClassName(element: React.ReactElement, className: string) {
  const { className: elementClassName = "", children } = element.props;
  return React.cloneElement(
    element,
    { className: `${elementClassName} ${className}` },
    children
  );
}

interface ITransitionGroupProps {
  readonly children: Array<React.ReactElement> | React.ReactElement;
  readonly transitionName: string;
  readonly transitionEnterTimeout: number;
  readonly transitionLeaveTimeout: number;
}

export const TransitionGroup: React.FC<ITransitionGroupProps> = ({
  children,
  transitionName,
  transitionEnterTimeout,
  transitionLeaveTimeout
}) => {
  // Ensure the children we're working with is an array of ReactElements
  const arrayChildren = React.useMemo(() => toArray(children), [children]);

  // The previous children of the transition group
  // By default, we do NOT animate elements in on first render
  const oldChildren = React.useRef<Array<React.ReactElement>>(arrayChildren);

  // The children which have been removed by the containing component and are being animated out
  const [leavingChildren, setLeavingChildren] = React.useState<
    Array<IElementWithIndex>
  >([]);

  // The children which have been recently added by the containing component and are being animated in (key only)
  const [enteringChildren, setEnteringChildren] = React.useState<
    Set<React.Key>
  >(new Set());

  // The animated elements which are not yet active - i.e. they have just been added or removed
  const [inactiveChildren, setInactiveChildren] = React.useState<
    Set<React.Key>
  >(new Set());

  // A store of the live timeouts
  const liveTimeouts = React.useRef<Map<React.Key, number>>(new Map());
  const clearLiveTimeout = React.useCallback((key: React.Key) => {
    const currentTimeout = liveTimeouts.current.get(key);
    if (currentTimeout) {
      window.clearInterval(currentTimeout);
    }
  }, []);

  // remove a key from the activeChildren set
  const makeElementActive = React.useCallback((key: React.Key) => {
    setInactiveChildren(localInactiveChildren => {
      const newInactiveChildren = new Set(localInactiveChildren);
      newInactiveChildren.delete(key);
      return newInactiveChildren;
    });
  }, []);
  // set an element as inactive the next frame
  const scheduleActivateElement = React.useCallback(
    (key: React.Key) => {
      window.setTimeout(() => makeElementActive(key), 100);
      // window.requestAnimationFrame(() => makeElementActive(key));
    },
    [makeElementActive]
  );

  // remove a key from the enteringChildren set
  const settleEnteringChild = React.useCallback((key: React.Key) => {
    setEnteringChildren(localEnteringChildren => {
      const newEnteringChildren = new Set(localEnteringChildren);
      newEnteringChildren.delete(key);
      return newEnteringChildren;
    });
  }, []);
  // settle an element after the required delay
  const scheduleSettleEnteringChild = React.useCallback(
    (key: React.Key) => {
      clearLiveTimeout(key);
      liveTimeouts.current.set(
        key,
        window.setTimeout(
          () => settleEnteringChild(key),
          transitionEnterTimeout
        )
      );
    },
    [clearLiveTimeout, settleEnteringChild, transitionEnterTimeout]
  );

  // remove a key from the enteringChildren set
  const removeLeavingChild = React.useCallback((key: React.Key) => {
    setLeavingChildren(localLeavingChildren => {
      // Since the leavingChildren are ordered, any *after* the removed child should have their index reduced by 1
      let reduceIndex = 0;
      return localLeavingChildren.reduce(
        (
          remainingLeavingChildren: Array<IElementWithIndex>,
          { element, index }
        ) => {
          if (element.key === key) {
            reduceIndex = 1;
            return remainingLeavingChildren;
          }
          return remainingLeavingChildren.concat({
            element,
            index: index - reduceIndex
          });
        },
        []
      );
    });
  }, []);
  // remove an element after the required delay
  const scheduleRemoveLeavingChild = React.useCallback(
    (key: React.Key) => {
      clearLiveTimeout(key);
      liveTimeouts.current.set(
        key,
        window.setTimeout(() => removeLeavingChild(key), transitionLeaveTimeout)
      );
    },
    [clearLiveTimeout, removeLeavingChild, transitionLeaveTimeout]
  );

  // Get newly added children (with index)
  const addedChildren = React.useMemo(
    () => elementDiff(arrayChildren, oldChildren.current),
    [arrayChildren]
  );

  // Update the current record of entering children with the newly added children
  React.useEffect(() => {
    if (addedChildren.length) {
      setEnteringChildren(localEnteringChildren => {
        addedChildren.forEach(({ element }) => {
          localEnteringChildren.add(element.key);
          scheduleSettleEnteringChild(element.key);
        });
        return localEnteringChildren;
      });
    }
  }, [addedChildren, scheduleSettleEnteringChild]);

  // Get newly removed children (with index)
  const removedChildren = React.useMemo(() => {
    console.log("Run A");
    const removedChildren = elementDiff(oldChildren.current, arrayChildren);
    return removedChildren;
  }, [arrayChildren]);

  const newLeavingChildren = React.useMemo(() => {
    if (removedChildren.length) {
      return mergeInRemovedChildren(removedChildren, leavingChildren);
    }
    return leavingChildren;
  }, [removedChildren, leavingChildren]);

  // Update the current record of leaving children with the newly removed children
  React.useEffect(() => {
    console.log("Run B");
    if (removedChildren.length) {
      setLeavingChildren(
        mergeInRemovedChildren(removedChildren, leavingChildren)
      );
      removedChildren.forEach(({ element }) =>
        scheduleRemoveLeavingChild(element.key)
      );
    }
  }, [newLeavingChildren, scheduleRemoveLeavingChild]);

  // Update the current record of inactive (just added/removed) animated elements
  // useLayoutEffect is used instead of useEffect to guarantee that we don't rerender
  // without having already added this to the removed array, otherwise it will disappear
  // then reappear
  React.useLayoutEffect(() => {
    if (addedChildren.length || removedChildren.length) {
      setInactiveChildren(localInactiveChildren => {
        const newInactiveChildren = new Set(localInactiveChildren);
        addedChildren.concat(removedChildren).forEach(({ element }) => {
          newInactiveChildren.add(element.key);
          scheduleActivateElement(element.key);
        });
        return newInactiveChildren;
      });
    }
  }, [addedChildren, removedChildren, scheduleActivateElement]);

  // Set the oldChildren to be the current children for the next render
  oldChildren.current = arrayChildren;

  const childrenToRender = React.useMemo(() => {
    const childrenToRenderLength =
      arrayChildren.length + leavingChildren.length;
    const localChildrenToRender: Array<React.ReactElement> = new Array(
      childrenToRenderLength
    );
    // First add the leaving children at the correct indices
    leavingChildren.forEach(({ element, index }) => {
      const isInactive = inactiveChildren.has(element.key);
      localChildrenToRender[index] = cloneWithClassName(
        element,
        `${transitionName}-leave ${
          isInactive ? "" : `${transitionName}-leave-active`
        }`
      );
    });
    // Then fill in the gaps with the still-existing children
    for (
      let index = 0, childIndex = 0;
      index < childrenToRenderLength;
      index++
    ) {
      if (!localChildrenToRender[index]) {
        const child = arrayChildren[childIndex];
        const isEntering = enteringChildren.has(child.key);
        const isInactive = inactiveChildren.has(child.key);
        const className = isEntering
          ? isInactive
            ? `${transitionName}-enter`
            : `${transitionName}-enter ${transitionName}-enter-active`
          : "";
        localChildrenToRender[index] = cloneWithClassName(
          arrayChildren[childIndex],
          className
        );
        childIndex++;
      }
    }

    return localChildrenToRender;
  }, [
    transitionName,
    arrayChildren,
    leavingChildren,
    enteringChildren,
    inactiveChildren
  ]);

  return <React.Fragment>{childrenToRender}</React.Fragment>;
};
